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

import { Logger, Module } from "@nestjs/common";
import { LogModule } from "@shared/modules/log/log.module";
import { WARLOCK } from "@shared/modules/warlock/warlock.constants";
import { RedisModule } from "@shared/modules/cache/redis.module";
import { LOGGER } from "@shared/modules/log/log.constants";
import { EnvLoader } from "@shared/utils/env.loader";
import { REDIS_CLIENT } from "@shared/modules/cache/cache.constants";
import Redis from "ioredis";
import * as Warlock from "node-redis-warlock";
import { WarlockFn } from "@shared/modules/warlock/warlock.types";

@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [LogModule],
      inject: [LOGGER],
      useFactory: (logger: Logger) => {
        EnvLoader.loadEnvironment(logger);
        return {
          config: {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT),
            db: parseInt(process.env.REDIS_DB),
            username: process.env.REDIS_USER,
            password: process.env.REDIS_PASSWORD
          }
        };
      }
    })
  ],
  providers: [
    {
      provide: WARLOCK,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis, lockLifeTime = 10000, lockKey = "lock"): WarlockFn => {
        const warlock = Warlock(client);
        return function(lockCode: string, caller: () => Promise<void>) {
          warlock.lock(`${lockKey}:${lockCode}`, lockLifeTime, async (err, unlock) => {
            if (err) {
              return;
            }
            if (typeof unlock === "function") {
              await caller();
              unlock();
            }
          });
        };
      }
    }
  ],
  exports: [
    WARLOCK
  ]
})
export class WarlockModule {
}
