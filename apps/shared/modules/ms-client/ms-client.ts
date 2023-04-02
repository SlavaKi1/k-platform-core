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

import { ClientProxy } from "@nestjs/microservices";
import { catchError, Observable, tap, throwError, timeout } from "rxjs";
import { MS_EXCEPTION_ID, TRANSPORT_OPTIONS } from "@shared/constants";
import { HttpException, HttpStatus, Inject, Logger } from "@nestjs/common";
import { MsClientOptions } from "@shared/modules/ms-client/ms-client.types";
import { MsException } from "@shared/exceptions/ms.exception";
import { ObjectUtils } from "@shared/utils/object.utils";
import { LOGGER } from "@shared/modules/log/log.constants";
import inspect = ObjectUtils.inspect;

export class MsClient {

  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly proxy: ClientProxy) {
  }

  dispatch<TResult = any, TInput = any>(pattern: any, data: TInput = Object(), opts?: MsClientOptions): Promise<TResult> {
    return new Promise<TResult>((resolve, reject) => {
      const source = this.proxy.send<TResult, TInput>(pattern, data);
      this.handleRequest(source, pattern, data, opts).subscribe({
        next: result => resolve(result),
        error: error => reject(error),
      });
    });
  }

  send<TResult = any, TInput = any>(pattern: any, data: TInput, opts?: MsClientOptions) {
    const source = this.proxy.send<TResult, TInput>(pattern, data);
    return this.handleRequest(source, pattern, data, opts);
  }

  emit<TResult = any, TInput = any>(pattern: any, data: TInput, opts?: MsClientOptions) {
    const source = this.proxy.emit<TResult, TInput>(pattern, data);
    return this.handleRequest(source, pattern, data, opts);
  }

  private handleRequest<T>(source: Observable<T>, pattern: any, data: any, opts?: MsClientOptions): Observable<T> {
    return source.pipe(
      tap(() => {
        this.logger.debug(`Sending request with pattern: ${inspect(pattern)}`);
      }),
      timeout(opts?.timeout || TRANSPORT_OPTIONS.timeout),
      catchError(error => {
        if (error?.type === MS_EXCEPTION_ID) {
          const err = error as MsException;
          this.logger.error(`Microservice exception: ${err.message}`, err.stack);
          throw new HttpException(err.message, err.code);
        }
        if (error.name === "TimeoutError") {
          this.logger.warn(`Request timeout for pattern: ${inspect(pattern)}}`);
          throw new HttpException("Request Timeout", HttpStatus.REQUEST_TIMEOUT);
        }
        this.logger.error(`Unknown error for pattern: ${inspect(pattern)}`, error);
        return throwError(error);
      }),
    );
  }

}

