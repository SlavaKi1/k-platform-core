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
import { LOGGER } from "@shared/modules/log/log.constants";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron/dist/job";
import { ProcessManagerService } from "./process-manager.service";
import { Process } from "./process.constants";
import { MSG_BROKER } from "@shared/modules/messages-broker/messages-broker.constants";
import { MessagesBrokerService } from "@shared/modules/messages-broker/messages-broker.service";
import { WARLOCK } from "@shared/modules/warlock/warlock.constants";
import { WarlockFn } from "@shared/modules/warlock/warlock.types";
import { ProcessUnit } from "./process.types";
import getProcessInstance = Process.getProcessInstance;
import Command = Process.Command;
import Status = Process.Status;


@Injectable()
export class ProcessRegisterService {

  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(WARLOCK) private readonly lockExec: WarlockFn,
    @Inject(MSG_BROKER) private readonly broker: MessagesBrokerService,
    private readonly pmService: ProcessManagerService,
    private readonly schedulerRegistry: SchedulerRegistry) {
    broker.subscribe<ProcessUnit>(
      Command.Register, data => this.registerCronJob(data)
    );
    broker.subscribe<ProcessUnit>(
      Command.Unregister, data => this.unregisterCronJob(data)
    );
  }

  private async registerCronJob(processData: ProcessUnit) {
    if (this.schedulerRegistry.doesExist("cron", processData.code)) {
      this.logger.warn(`Can't register cron job with code ${processData.code}, that already exists`);
      return false;
    }
    await this.pmService.setProcessUnitStatus(processData.code, Status.Ready);
    const processInstance = getProcessInstance(processData.code);
    if (!processData.cronTab?.length) {
      this.logger.warn(`Process ${processData.code} hasn't cron-tab, skip job registration`);
      return false;
    }
    const job = new CronJob(processData.cronTab, () => {
      this.lockExec(processData.code, async () => {
        await processInstance.start();
      });
    });
    job.start();
    this.schedulerRegistry.addCronJob(processData.code, job);
    return true;
  }

  private async unregisterCronJob(processData: ProcessUnit) {
    if (!this.schedulerRegistry.doesExist("cron", processData.code)) {
      this.logger.warn(`Can't unregister cron job with code ${processData.code}`);
      return false;
    }
    const job = this.schedulerRegistry.getCronJob(processData.code);
    job.stop();
    this.schedulerRegistry.deleteCronJob(processData.code);
    this.pmService.stopProcess(processData.code);
    return true;
  }

}