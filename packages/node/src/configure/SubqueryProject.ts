// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Injectable } from '@nestjs/common';
import { Reader, RunnerSpecs, validateSemver } from '@subql/common';
import {
  StellarProjectNetworkConfig,
  parseStellarProjectManifest,
  SubqlStellarDataSource,
  ProjectManifestV1_0_0Impl,
  isCustomDs,
} from '@subql/common-stellar';
import { getProjectRoot, updateDataSourcesV1_0_0 } from '@subql/node-core';
import { buildSchemaFromString } from '@subql/utils';
import { GraphQLSchema } from 'graphql';

export type SubqlProjectDs = SubqlStellarDataSource & {
  mapping: SubqlStellarDataSource['mapping'] & { entryScript: string };
};

export type SubqlProjectDsTemplate = Omit<SubqlProjectDs, 'startBlock'> & {
  name: string;
};

const NOT_SUPPORT = (name: string) => {
  throw new Error(`Manifest specVersion ${name} is not supported`);
};

// This is the runtime type after we have mapped genesisHash to chainId and endpoint/dict have been provided when dealing with deployments
type NetworkConfig = StellarProjectNetworkConfig & { chainId: string };

@Injectable()
export class SubqueryProject {
  id: string;
  root: string;
  network: NetworkConfig;
  dataSources: SubqlProjectDs[];
  schema: GraphQLSchema;
  templates: SubqlProjectDsTemplate[];
  runner?: RunnerSpecs;

  static async create(
    path: string,
    rawManifest: unknown,
    reader: Reader,
    networkOverrides?: Partial<StellarProjectNetworkConfig>,
    root?: string,
  ): Promise<SubqueryProject> {
    // rawManifest and reader can be reused here.
    // It has been pre-fetched and used for rebase manifest runner options with args
    // in order to generate correct configs.

    // But we still need reader here, because path can be remote or local
    // and the `loadProjectManifest(projectPath)` only support local mode
    if (rawManifest === undefined) {
      throw new Error(`Get manifest from project path ${path} failed`);
    }
    const manifest = parseStellarProjectManifest(rawManifest);

    if (manifest.isV1_0_0) {
      return loadProjectFromManifest1_0_0(
        manifest.asV1_0_0,
        reader,
        path,
        networkOverrides,
        root,
      );
    } else {
      NOT_SUPPORT(manifest.specVersion);
    }
  }
}

function processChainId(network: any): NetworkConfig {
  if (network.chainId && network.genesisHash) {
    throw new Error('Please only provide one of chainId and genesisHash');
  } else if (network.genesisHash && !network.chainId) {
    network.chainId = network.genesisHash;
  }
  delete network.genesisHash;
  return network;
}

type SUPPORT_MANIFEST = ProjectManifestV1_0_0Impl;

async function loadProjectFromManifestBase(
  projectManifest: SUPPORT_MANIFEST,
  reader: Reader,
  path: string,
  networkOverrides?: Partial<StellarProjectNetworkConfig>,
  root?: string,
): Promise<SubqueryProject> {
  root = root ?? (await getProjectRoot(reader));

  if (typeof projectManifest.network.endpoint === 'string') {
    projectManifest.network.endpoint = [projectManifest.network.endpoint];
  }

  const network = processChainId({
    ...projectManifest.network,
    ...networkOverrides,
  });

  if (!network.soroban) {
    throw new Error(
      `Soroban network endpoint must be provided for network. chainId="${network.chainId}"`,
    );
  }

  if (!network.endpoint) {
    throw new Error(
      `Stellar network endpoint must be provided for network. chainId="${network.chainId}"`,
    );
  }

  let schemaString: string;
  try {
    schemaString = await reader.getFile(projectManifest.schema.file);
  } catch (e) {
    throw new Error(
      `unable to fetch the schema from ${projectManifest.schema.file}`,
    );
  }
  const schema = buildSchemaFromString(schemaString);

  const dataSources = await updateDataSourcesV1_0_0(
    projectManifest.dataSources,
    reader,
    root,
    isCustomDs,
  );

  const templates = await loadProjectTemplates(projectManifest, root, reader);

  return {
    id: reader.root ? reader.root : path, //TODO, need to method to get project_id
    root,
    network,
    dataSources,
    schema,
    templates,
  };
}

const { version: packageVersion } = require('../../package.json');

async function loadProjectFromManifest1_0_0(
  projectManifest: ProjectManifestV1_0_0Impl,
  reader: Reader,
  path: string,
  networkOverrides?: Partial<StellarProjectNetworkConfig>,
  root?: string,
): Promise<SubqueryProject> {
  const project = await loadProjectFromManifestBase(
    projectManifest,
    reader,
    path,
    networkOverrides,
    root,
  );
  project.runner = projectManifest.runner;
  if (!validateSemver(packageVersion, project.runner.node.version)) {
    throw new Error(
      `Runner require node version ${project.runner.node.version}, current node ${packageVersion}`,
    );
  }
  return project;
}

async function loadProjectTemplates(
  projectManifest: ProjectManifestV1_0_0Impl,
  root: string,
  reader: Reader,
): Promise<SubqlProjectDsTemplate[]> {
  if (!projectManifest.templates || !projectManifest.templates.length) {
    return [];
  }
  const dsTemplates = await updateDataSourcesV1_0_0(
    projectManifest.templates,
    reader,
    root,
    isCustomDs,
  );

  return dsTemplates.map((ds, index) => ({
    ...ds,
    name: projectManifest.templates[index].name,
  }));
}

/*
// eslint-disable-next-line @typescript-eslint/require-await
export async function generateTimestampReferenceForBlockFilters(
  dataSources: SubqlProjectDs[],
  api: StellarApi,
): Promise<SubqlProjectDs[]> {
  const cron = new Cron();

  dataSources = await Promise.all(
    dataSources.map(async (ds) => {
      if (isRuntimeDs(ds)) {
        const startBlock = ds.startBlock ?? 1;
        let block: Block;
        let timestampReference: Date;

        ds.mapping.handlers = await Promise.all(
          ds.mapping.handlers.map(async (handler) => {
            if (handler.kind === StellarHandlerKind.Block) {
              if (handler.filter?.timestamp) {
                if (!block) {
                  block = await api.getBlockByHeightOrHash(startBlock);
                  timestampReference = new Date(block.timestamp * 1000); // Add millis
                }
                try {
                  cron.fromString(handler.filter.timestamp);
                } catch (e) {
                  throw new Error(
                    `Invalid Cron string: ${handler.filter.timestamp}`,
                  );
                }

                const schedule = cron.schedule(timestampReference);
                (handler.filter as SubqlProjectBlockFilter).cronSchedule = {
                  schedule: schedule,
                  get next() {
                    return Date.parse(this.schedule.next().format());
                  },
                };
              }
            }
            return handler;
          }),
        );
      }
      return ds;
    }),
  );

  return dataSources;
}
*/
