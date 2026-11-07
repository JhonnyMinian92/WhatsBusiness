import { Injectable } from "@nestjs/common";

export interface ReadinessSnapshot {
  readonly ready: boolean;
  readonly checks: ReadonlyArray<{ readonly name: string; readonly status: "ok" | "degraded" | "failed" }>;
}

@Injectable()
export class ReadinessService {
  /**
   * Fail closed until the required runtime adapters (database, broker, cache and
   * identity provider) are wired and actively probed by the application.
   */
  snapshot(): ReadinessSnapshot {
    return {
      ready: false,
      checks: [
        { name: "postgresql", status: "degraded" },
        { name: "rabbitmq", status: "degraded" },
        { name: "valkey", status: "degraded" },
        { name: "oidc", status: "degraded" },
      ],
    };
  }
}
