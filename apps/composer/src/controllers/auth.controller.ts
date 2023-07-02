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


import { Body, Controller, Inject, Post, Req, UseGuards } from "@nestjs/common";
import { ExchangeTokenPayload, JwtDto, LoginPayload } from "@auth/src/auth.types";
import { LiteAuthGuard } from "@shared/guards/lite-auth.guard";
import { AccessToken } from "@shared/decorators/access-token.decorator";
import { ResponseDto } from "@shared/decorators/response-dto.decorator";
import { Request } from "express";
import { MSG_BUS } from "@shared/modules/ms-client/ms-client.constants";
import { MessageBus } from "@shared/modules/ms-client/ms-client.types";

@Controller("/auth")
export class AuthController {

  constructor(
    @Inject(MSG_BUS) private readonly bus: MessageBus) {
  }

  @ResponseDto(JwtDto)
  @Post("/login")
  async login(@Body() payload: LoginPayload, @Req() request: Request) {
    if (request.ip) {
      payload.ipAddress = request.ip;
    }
    return await this.bus.dispatch<JwtDto, LoginPayload>("auth.login", payload);
  }

  @UseGuards(LiteAuthGuard)
  @Post("/logout")
  async logout(@AccessToken() token: string) {
    const result = await this.bus.dispatch<boolean, string>("auth.logout", token);
    return { result };
  }

  @ResponseDto(JwtDto)
  @Post("/exchange-token")
  async exchange(@Body() payload: ExchangeTokenPayload) {
    return await this.bus.dispatch<JwtDto, string>("auth.token.exchange", payload.token);
  }

}
