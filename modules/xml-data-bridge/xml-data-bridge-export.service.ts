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
import { XdbDecomposedEntity, XdbExportParams } from "@xml-data-bridge/xml-data-bridge.types";
import { ObjectLiteral } from "typeorm";
import { MediaManager } from "@media/media.types";
import { Xdb, XdbExportService } from "@xml-data-bridge/xml-data-bridge.constants";
import { CacheService } from "@shared/modules/cache/cache.types";
import { ExplorerColumn, ExplorerService, ExplorerTargetParams, TargetData } from "@explorer/explorer.types";
import { XmlDataBridgeFileSchema } from "@xml-data-bridge/xml-data-bridge-file-schema";
import { FilesUtils } from "@shared/utils/files.utils";
import { NumberUtils } from "@shared/utils/number.utils";
import * as fs from "fs";
import { KpConfig } from "../../gen-src/kp.config";
import xmlFileSchemaTpl = XmlDataBridgeFileSchema.xmlFileSchemaTpl;
import xmlFileInsertUpdateNodeTpl = XmlDataBridgeFileSchema.xmlFileInsertUpdateNodeTpl;
import BODY_TOKEN = XmlDataBridgeFileSchema.BODY_TOKEN;
import createDirectoriesIfNotExist = FilesUtils.createDirectoriesIfNotExist;
import generateRandomInt = NumberUtils.generateRandomInt;
import xmlFileRowNode = XmlDataBridgeFileSchema.xmlFileRowNode;
import xmlFileRowPropertyNode = XmlDataBridgeFileSchema.xmlFileRowPropertyNode;
import rootToken = Xdb.rootToken;

/**
 * XmlDataBridgeService is responsible for importing and exporting data through XML.
 */
@Injectable()
export class XmlDataBridgeExportService extends XdbExportService {


  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly mediaService: MediaManager,
    private readonly cacheService: CacheService,
    private readonly explorerService: ExplorerService) {
    super();
  }

  /**
   * Export XML data to a specified target.
   * @param params - object with export params XdbExportParams
   * @returns A string if object exported to zip-file
   */
  async exportXml(params: XdbExportParams) {
    const tParams: ExplorerTargetParams = { readRequest: true, checkUserAccess: params.user };
    const target = await this.explorerService.getTargetData(params.target, tParams);
    const entity = await this.explorerService.getEntityData(params.target, params.id, params.depth, tParams);
    const decomposedEntityStack = await this.decomposeEntity(entity, target, tParams);
    const xmlBody = this.buildXmlBody(decomposedEntityStack);

    // todo special handling media and file entities
    // todo handle export form params

    const tmpDir = process.cwd() + await this.cacheService.get(KpConfig.TMP_DIR);
    await createDirectoriesIfNotExist(tmpDir);
    const fileName = `${params.target.toLowerCase()}-${params.id}-${generateRandomInt()}`;
    const zipFilePath = `${tmpDir}/${fileName}.zip`;
    const operationDir = `${tmpDir}/${fileName}`;

    // todo remove next 2 lines
    const xmlFilePath = `${tmpDir}/${fileName}.xml`;
    await fs.promises.writeFile(xmlFilePath, xmlBody);
    return { file: `${fileName}.xml` };

    // todo save archive
    // const zip = new AdmZip();
    // add file directly
    /*const content = "inner content of the file";
    zip.addFile("test.txt", Buffer.from(content, "utf8"), "entry comment goes here");*/
    // add local file
    // zip.addLocalFile("/home/me/some_picture.png");
    // get everything as a buffer
    // const willSendthis = zip.toBuffer();
    // or write everything to disk
    // zip.writeZip(/*target file name*/ "/home/me/files.zip");
    return { file: "true" };
  }

  private buildXmlBody(decomposedEntityStack: XdbDecomposedEntity[]) {
    let body = ``;
    for (const entity of decomposedEntityStack) {
      const node = xmlFileInsertUpdateNodeTpl(entity.metadata.type);
      let rowBody = ``;
      for (const key of Object.keys(entity.data)) {
        const row = xmlFileRowPropertyNode(decomposedEntityStack, key, entity.data[key]);
        if (!row) {
          continue;
        }
        rowBody += row;
      }
      body += node.replace(BODY_TOKEN, xmlFileRowNode().replace(BODY_TOKEN, rowBody));
    }
    const xmlBody = xmlFileSchemaTpl();
    return xmlBody.replace(BODY_TOKEN, body);
  }

  private async decomposeEntity(object: ObjectLiteral, target: TargetData, tParams: ExplorerTargetParams) {
    let stack: XdbDecomposedEntity[] = [];
    this.handleNode(stack, object, rootToken);
    // remove root duplicates
    const rootNode = stack.find(v => v.metadata.fieldName === rootToken);
    const rootPrimaryCol = target.entity.columns.find(v => v.primary);
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i];
      if (node.metadata.fieldName === rootToken || node.metadata.type !== target.entity.target) {
        continue;
      }
      if (node.data[rootPrimaryCol.property] === rootNode.data[rootPrimaryCol.property]) {
        stack.splice(i, 1);
      }
    }

    stack = Xdb.removeDuplicateObjects(stack).reverse();
    const root = stack[stack.length - 1];
    await this.markReferences(rootPrimaryCol, tParams, stack, root.data, root.data, rootToken);
    // mark root object
    for (const key of Object.keys(root.data)) {
      if (this.isPrimitiveNode(root.data[key])) {
        continue;
      }
      if (Array.isArray(root.data[key])) {
        for (let i = 0; i < root.data[key].length; i++) {
          const target = await this.explorerService.getTargetData(root.data[key][i].constructor.name, tParams);
          const p = `${rootToken}/${key}`;
          const keyName = this.getKeyPropertyName(target, root.data[key][i]);
          root.data[key][i] = `${p}#${keyName}:${root.data[key][i][keyName]}`;
        }
      } else {
        const target = await this.explorerService.getTargetData(root.data[key].constructor.name, tParams);
        const p = `${rootToken}/${key}`;
        const keyName = this.getKeyPropertyName(target, root.data[key]);
        root.data[key] = `${p}#${keyName}:${root.data[key][keyName]}`;
      }
    }
    // clean keys
    this.getKeyPropertyName(target, root.data);
    return await this.handleStackRoots(stack, tParams);
  }

  private async handleStackRoots(stack: XdbDecomposedEntity[], tParams: ExplorerTargetParams) {
    for (let i = stack.length - 1; i >= 0; i--) {
      for (const key of Object.keys(stack[i].data)) {
        if (this.isPrimitiveNode(stack[i].data[key])) {
          continue;
        }
        if (Array.isArray(stack[i].data[key])) {
          if (!stack[i].data[key].length) {
            delete stack[i].data[key];
            continue;
          }
          if (typeof stack[i].data[key][0] === "string" && stack[i].data[key][0].startsWith(rootToken)) {
            continue;
          }
          for (const j in stack[i].data[key]) {
            const target = await this.explorerService.getTargetData(stack[i].data[key][j].constructor.name, tParams);
            const keyName = this.getKeyPropertyName(target, stack[i].data[key][j]);
            const stackEl = stack.find(
              v => v.metadata.type === target.entity.target && v.data[keyName] === stack[i].data[key][j][keyName]
            );
            stack[i].data[key][j] = `${stackEl.metadata.path}#${keyName}:${stack[i].data[key][j][keyName]}`;
          }
        } else {
          const target = await this.explorerService.getTargetData(stack[i].data[key].constructor.name, tParams);
          const keyName = this.getKeyPropertyName(target, stack[i].data[key]);
          const stackEl = stack.find(
            v => v.metadata.type === target.entity.target && v.data[keyName] === stack[i].data[key][keyName]
          );
          stack[i].data[key] = `${stackEl.metadata.path}#${keyName}:${stack[i].data[key][keyName]}`;
        }
      }
    }
    return stack;
  }

  private async markReferences(rootPrimaryCol: ExplorerColumn, tParams: ExplorerTargetParams, stack: XdbDecomposedEntity[], node: ObjectLiteral, parent: ObjectLiteral, path: string) {
    const root = stack[stack.length - 1];
    for (const key in node) {
      if (this.isPrimitiveNode(node[key])) {
        continue;
      }
      if (Array.isArray(node[key])) {
        if (!node[key].length) {
          delete node[key];
          continue;
        }
        for (const arrEl of node[key]) {
          const target = await this.explorerService.getTargetData(arrEl.constructor.name, tParams);
          const p = `${path}/${key}`;
          const stackEl = stack.find(
            v => v.metadata.path === p && v.data[target.primaryColumn.property] === arrEl[target.primaryColumn.property]
          );
          if (!stackEl) {
            continue;
          }
          for (const sDataElKey of Object.keys(stackEl.data)) {
            if (this.isPrimitiveNode(stackEl.data[sDataElKey])) {
              continue;
            }
            const sdTarget = await this.explorerService.getTargetData(stackEl.data[sDataElKey].constructor.name, tParams);
            if (!sdTarget) {
              continue;
            }
            const sdP = `${p}/${sDataElKey}`;
            if (sdTarget.entity.target === root.metadata.type && stackEl.data[sDataElKey][rootPrimaryCol.property] === root.data[rootPrimaryCol.property]) {
              delete stackEl.data[sDataElKey];
              continue;
            }
            const keyName = this.getKeyPropertyName(sdTarget, stackEl.data[sDataElKey]);
            stackEl.data[sDataElKey] = `${sdP}#${keyName}:${stackEl.data[sDataElKey][keyName]}`;
          }
        }
      } else {
        if (this.hasNestedNodes(node[key])) {
          await this.markReferences(rootPrimaryCol, tParams, stack, node[key], node, `${path}/${key}`);
        } else {
          if (node[key].constructor.name === "Object") {
            node[key] = JSON.stringify(node[key]);
            continue;
          }
          const target = await this.explorerService.getTargetData(node[key].constructor.name, tParams);
          const p = `${path}/${key}`;
          const keyName = this.getKeyPropertyName(target, node[key]);
          node[key] = `${p}#${keyName}:${node[key][keyName]}`;
          await this.markReferences(rootPrimaryCol, tParams, stack, node[key], node, `${path}/${key}`);
        }
      }
    }
  }

  private handleNode(stack: XdbDecomposedEntity[], node: ObjectLiteral, fieldName: string, path?: string, arrayClassName?: string) {
    if (this.isPrimitiveNode(node)) {
      return;
    }
    if (node.constructor.name === "Object") {
      return;
    }
    const newPath = path ? `${path}/${fieldName}` : fieldName;
    if (!Array.isArray(node) || (Array.isArray(node) && node?.length > 0)) {
      const type = arrayClassName ?? node.constructor.name;
      if (type !== "Array") {
        stack.push({
          metadata: { type, fieldName, path: newPath },
          data: node
        });
      }
    }
    if (!Array.isArray(node)) {
      for (const key of Object.keys(node)) {
        if (node[key] === null) {
          continue;
        }
        this.handleNode(stack, node[key], key, newPath);
      }
    } else {
      const arrNode = (node as Array<ObjectLiteral>);
      const arrClassName = arrNode[0]?.constructor?.name;
      for (const e of arrNode) {
        this.handleNode(stack, e, fieldName, path, arrClassName);
      }
    }
  }

  private isPrimitiveNode(node: ObjectLiteral) {
    return !node || typeof node !== "object" || node instanceof Date;
  }

  private hasNestedNodes(node: ObjectLiteral) {
    for (const key in node) {
      if (!this.isPrimitiveNode(node[key])) {
        return true;
      }
    }
    return false;
  }

  private getKeyPropertyName(target: TargetData, node: ObjectLiteral) {
    const primaryProperty = target.primaryColumn.property;
    const uniqColumns = target.entity.columns.filter(v => v.unique);
    if (!uniqColumns?.length) {
      return primaryProperty;
    }
    for (const col of uniqColumns) {
      if (node[col.property] && (typeof node[col.property] === "string" || typeof node[col.property] === "number")) {
        if (col.property !== primaryProperty) {
          delete node[primaryProperty];
        }
        return col.property;
      }
    }
    const propertyName = uniqColumns[0].property;
    node[propertyName] = `${target.entity.target.toLowerCase()}_${node[primaryProperty]}`;
    delete node[primaryProperty];
    return propertyName;
  }


}
