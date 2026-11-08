import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { ApiProblemFilter } from "./platform/http/api-problem.filter.js";
import { json } from "express";
import type { Request } from "express";

type RequestWithRawBody = Request & { rawBody?: Buffer };

async function bootstrap(): Promise<void> {
  const rawPort = process.env["PORT"] ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port");
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.use(json({
    limit: "3mb",
    verify: (request, _response, buffer) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(buffer);
    },
  }));
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiProblemFilter());
  app.enableShutdownHooks();
  await app.listen(port, "0.0.0.0");
}

void bootstrap().catch(() => {
  console.error("WhatsBusiness API failed to start");
  process.exitCode = 1;
});
