import {
  Controller, Get, Headers, HttpException, Param, Post, Query, Req, Res, ServiceUnavailableException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { isMetaWebhookProduct, type MetaWebhookProduct, MetaWebhookIngressError, MetaWebhookIngressService } from "@whatsbusiness/microservices-meta-ecuapp";


type RequestWithRawBody = Request & { rawBody?: Buffer };

@Controller("v1/webhooks/meta")
export class MetaWebhookController {
  constructor(private readonly ingress: MetaWebhookIngressService) {}

  @Get(":product")
  async verify(
    @Param("product") productValue: string,
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") verifyToken: string | undefined,
    @Query("hub.challenge") challenge: string | undefined,
    @Res() response: Response,
  ): Promise<Response> {
    const product = this.product(productValue);
    try {
      const echo = await this.ingress.verifyChallenge(product, mode, verifyToken, challenge);
      return response.status(200).type("text/plain").send(echo);
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  @Post(":product")
  async receive(
    @Param("product") productValue: string,
    @Headers("content-type") contentType: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Headers("x-correlation-id") correlationId: string | undefined,
    @Req() request: RequestWithRawBody,
    @Res() response: Response,
  ): Promise<Response> {
    const product = this.product(productValue);
    if (typeof contentType !== "string" || contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      throw new HttpException({ code: "META_WEBHOOK_CONTENT_TYPE_INVALID" }, 415);
    }
    try {
      await this.ingress.receive(product, request.rawBody, signature, correlationId);
      // HTTP ACK is sent only after PostgreSQL commits the encrypted inbox and event outbox.
      return response.status(200).json({ received: true });
    } catch (error) {
      this.throwHttpError(error);
    }
  }

  private product(value: string): MetaWebhookProduct {
    if (!isMetaWebhookProduct(value)) throw new HttpException({ code: "META_WEBHOOK_PRODUCT_NOT_SUPPORTED" }, 404);
    return value;
  }

  private throwHttpError(error: unknown): never {
    if (error instanceof MetaWebhookIngressError) {
      throw new HttpException({ code: error.code }, error.httpStatus);
    }
    throw new ServiceUnavailableException("Meta webhook ingress is temporarily unavailable.");
  }
}
