// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import { Module } from '@nestjs/common';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import {
  ApiService,
  ConnectionPoolService,
  ConnectionPoolStateManager,
  DbModule,
  NodeConfig,
  PoiService,
  StoreService,
  TestRunner,
} from '@subql/node-core';
import { ConfigureModule } from '../configure/configure.module';
import { SubqueryProject } from '../configure/SubqueryProject';
import { DsProcessorService } from '../indexer/ds-processor.service';
import { DynamicDsService } from '../indexer/dynamic-ds.service';
import { FetchModule } from '../indexer/fetch.module';
import { IndexerManager } from '../indexer/indexer.manager';
import { ProjectService } from '../indexer/project.service';
import { SandboxService } from '../indexer/sandbox.service';
import { UnfinalizedBlocksService } from '../indexer/unfinalizedBlocks.service';
import { MetaModule } from '../meta/meta.module';
import { StellarApiService } from '../stellar';
import { StellarApiConnection } from '../stellar/api.connection';
import { TestingService } from './testing.service';

@Module({
  providers: [
    StoreService,
    TestingService,
    EventEmitter2,
    PoiService,
    SandboxService,
    DsProcessorService,
    DynamicDsService,
    UnfinalizedBlocksService,
    ConnectionPoolService,
    ConnectionPoolStateManager,
    {
      provide: 'IProjectService',
      useClass: ProjectService,
    },
    {
      provide: ApiService,
      useFactory: async (
        project: SubqueryProject,
        connectionPoolService: ConnectionPoolService<StellarApiConnection>,
        eventEmitter: EventEmitter2,
      ) => {
        const apiService = new StellarApiService(
          project,
          connectionPoolService,
          eventEmitter,
        );
        await apiService.init();
        return apiService;
      },
      inject: ['ISubqueryProject', ConnectionPoolService, EventEmitter2],
    },
    TestRunner,
    {
      provide: 'IApi',
      useClass: StellarApiService,
    },
    {
      provide: 'IIndexerManager',
      useClass: IndexerManager,
    },
    IndexerManager,
    SchedulerRegistry,
  ],

  controllers: [],
  exports: [TestRunner],
})
export class TestingFeatureModule {}

@Module({
  imports: [
    DbModule.forRoot(),
    ConfigureModule.register(),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    TestingFeatureModule,
  ],
  controllers: [],
})
export class TestingModule {}
