/*
 * Copyright 2023 Alexander Kiriliuk
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

import { Inject, Injectable, Logger } from "@nestjs/common";
import { AbstractAuthGuard } from "@shared/guards/abstract-auth.guard";
import { CacheService } from "@shared/modules/cache/cache.types";
import { LOGGER } from "@shared/modules/log/log.constants";
import { MSG_BUS } from "@shared/modules/ms-client/ms-client.constants";
import { MessageBus } from "@shared/modules/ms-client/ms-client.types";

/**
 * @class LiteAuthGuard
 * An authentication guard that extends AbstractAuthGuard, used for lightweight authentication without user fetching.
 */
@Injectable()
export class LiteAuthGuard extends AbstractAuthGuard {

  protected fetchUser = false;

  constructor(
    @Inject(MSG_BUS) protected readonly bus: MessageBus,
    @Inject(LOGGER) protected readonly logger: Logger,
    protected readonly cacheService: CacheService) {
    super();
  }

}
