// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Inject, Injectable } from '@nestjs/common';
import { NETWORK_FAMILY } from '@subql/common';
import {
  NodeConfig,
  DictionaryService as CoreDictionaryService,
} from '@subql/node-core';
import EventEmitter2 from 'eventemitter2';
import { SubqueryProject } from '../configure/SubqueryProject';

@Injectable()
export class DictionaryService extends CoreDictionaryService {
  private constructor(
    @Inject('ISubqueryProject') protected project: SubqueryProject,
    eventEmitter: EventEmitter2,
    nodeConfig: NodeConfig,
    dictionaryUrl?: string,
  ) {
    super(dictionaryUrl, project.network.chainId, nodeConfig, eventEmitter);
  }

  static async create(
    project: SubqueryProject,
    nodeConfig: NodeConfig,
    eventEmitter: EventEmitter2,
  ): Promise<DictionaryService> {
    let url =
      project.network.dictionary ??
      (await CoreDictionaryService.resolveDictionary(
        NETWORK_FAMILY.stellar,
        project.network.chainId,
        nodeConfig.dictionaryRegistry,
      ));
    if (Array.isArray(url)) {
      url = url[0];
    }
    return new DictionaryService(project, eventEmitter, nodeConfig, url);
  }
}
