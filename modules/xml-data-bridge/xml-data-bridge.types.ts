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


import { Type, Type as Class } from "@nestjs/common/interfaces/type.interface";
import { XdbService } from "@xml-data-bridge/xml-data-bridge.constants";
import { DynamicModule } from "@nestjs/common/interfaces/modules/dynamic-module.interface";
import { ForwardReference } from "@nestjs/common/interfaces/modules/forward-reference.interface";

export interface XdbRequest {
  target: string;
  id: string;
}

export type XdbRowDataValue = {
  attrs?: {
    key?: string;
    uri?: string;
  };
  value?: string;
  values?: string[];
}

export type XdbRowData = {
  [key: string]: XdbRowDataValue;
};

export type MediaRow = {
  name: XdbRowDataValue;
  code: string;
  type: string;
  file: string;
}

export type FileRow = {
  name: XdbRowDataValue;
  code: string;
  public: boolean;
  file: string;
}

export type XdbAction = {
  action: "InsertUpdate" | "Media" | "File" | "Remove" | "Include";
  attrs: {
    target?: string;
    read?: string;
  };
  rows: Array<XdbRowData | FileRow>;
};

export type XdbObject = {
  schema: XdbAction[];
};

export type XdbModuleOptions = {
  service: Class<XdbService>,
  imports: Array<Type<any> | DynamicModule | Promise<DynamicModule> | ForwardReference>;
};