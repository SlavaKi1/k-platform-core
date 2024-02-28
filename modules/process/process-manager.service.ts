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

import { Inject, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProcessUnitEntity } from "./entity/process.unit.entity";
import { LOGGER } from "@shared/modules/log/log.constants";
import { Process } from "./process.constants";
import { MessagesBrokerService } from "@shared/modules/messages-broker/messages-broker.service";
import { MSG_BROKER } from "@shared/modules/messages-broker/messages-broker.constants";
import { WARLOCK } from "@shared/modules/warlock/warlock.constants";
import { WarlockFn } from "@shared/modules/warlock/warlock.types";
import Status = Process.Status;
import Command = Process.Command;
import getProcessInstance = Process.getProcessInstance;


@Injectable()
export class ProcessManagerService {

  private static pmInitStatus: boolean;

  constructor(
    @Inject(WARLOCK) private readonly lockExec: WarlockFn,
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(MSG_BROKER) private readonly broker: MessagesBrokerService,
    @InjectRepository(ProcessUnitEntity)
    private readonly processUnitRep: Repository<ProcessUnitEntity>) {
  }

  async init() {
    if (ProcessManagerService.pmInitStatus) {
      this.logger.warn("Autostart processes has been executed");
      return;
    }
    await this.resetAllProcessStatuses();
    this.logger.log("Init process manager");
    ProcessManagerService.pmInitStatus = true;
    const processList = await this.processUnitRep.find({ where: { enabled: true } });
    for (const processData of processList) {
      if (!processData.cronTab?.length) {
        this.logger.warn(`Process ${processData.code} hasn't cron-tab, skip job registration`);
        continue;
      }
      this.broker.emit(Command.Register, processData);
    }
  }

  async startProcess(code: string) {
    this.lockExec(code, async () => {
      const processData = await this.getProcessData(code, true);
      if (!processData) {
        throw new InternalServerErrorException(`Process ${code} hasn't options-data`);
      }
      const processInstance = getProcessInstance(code);
      processInstance.start();
    });
  }

  async stopProcess(code: string) {
    this.lockExec(code, async () => {
      const processData = await this.getProcessData(code, true);
      if (!processData) {
        throw new InternalServerErrorException(`Process ${code} hasn't options-data`);
      }
      const processInstance = getProcessInstance(code);
      processInstance.stop();
    });
  }

  async toggleProcess(code: string) {
    const processInstance = getProcessInstance(code);
    if (!processInstance) {
      throw new InternalServerErrorException(`Process ${code} not exists`);
    }
    const processData = await this.processUnitRep.findOne({ where: { code } });
    processData.enabled = !processData.enabled;
    await this.processUnitRep.save(processData);
    if (processData.enabled) {
      this.broker.emit(Command.Register, processData);
    } else {
      this.broker.emit(Command.Unregister, processData);
    }
  }

  async setProcessUnitStatus(code: string, status: Process.Status) {
    const processData = await this.getProcessData(code, true);
    processData.status = status;
    return this.processUnitRep.save(processData);
  }

  async getProcessUnitStatus(code: string) {
    const processData = await this.getProcessData(code, true);
    return processData.status;
  }

  private getProcessData(code: string, force = false) {
    const params = { code, enabled: true };
    return this.processUnitRep.findOne({ where: force ? { code } : params });
  }

  private async resetAllProcessStatuses() {
    const entities = await this.processUnitRep.find({ where: { enabled: true } });
    for (const processData of entities) {
      await this.setProcessUnitStatus(processData.code, Status.Ready);
    }
  }

}
