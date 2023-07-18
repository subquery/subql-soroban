// Copyright 2020-2022 OnFinality Limited authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getLogger } from '@subql/node-core';
import { Server, SorobanRpc } from 'soroban-client';
import { GetEventsRequest } from 'soroban-client/lib/server';

const logger = getLogger('soroban-server');

export class SorobanServer extends Server {
  private eventsCache: { [key: number]: SorobanRpc.GetEventsResponse } = {};

  async getEvents(
    request: GetEventsRequest,
  ): Promise<SorobanRpc.GetEventsResponse> {
    if (this.eventsCache[request.startLedger]) {
      const cachedEvents = this.eventsCache[request.startLedger];
      delete this.eventsCache[request.startLedger];

      return new Promise((resolve) => {
        //resolving immediately will make performance score go to NaN
        setTimeout(() => resolve(cachedEvents), 2);
      });
    }

    const response = await super.getEvents(request);

    const maxEventHeight =
      response.events.length > 0
        ? parseInt(response.events[response.events.length - 1].ledger)
        : request.startLedger;

    for (let h = request.startLedger; h <= maxEventHeight; h++) {
      this.eventsCache[h] =
        this.eventsCache[h] || ({ events: [] } as SorobanRpc.GetEventsResponse);
    }

    //exclude maxEventHeight as some of the events in it might be paginated out
    response.events.forEach((event) =>
      this.eventsCache[parseInt(event.ledger)].events.push(event),
    );

    return this.eventsCache[request.startLedger];
  }
}
