import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  OIDC_JWKS_URL: z.string().url(),
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(32),
  META_BUSINESS_LOGIN_CONFIG_ID: z.string().min(1),
  META_OAUTH_REDIRECT_URI: z.string().url(),
  META_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v27.0"),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(32),
  META_WEBHOOK_PUBLIC_URL: z.string().url(),
  PRIVACY_POLICY_URL: z.string().url(),
  TERMS_OF_SERVICE_URL: z.string().url(),
  DATA_DELETION_URL: z.string().url(),
  DATA_DELETION_CALLBACK_URL: z.string().url(),
  TOKEN_ENCRYPTION_MODE: z.enum(["local", "aws-kms"]).default("local"),
  TOKEN_ENCRYPTION_KEY_BASE64: z.string().optional(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_KMS_KEY_ID: z.string().optional(),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  EVENT_BUS_HTTP_URL: z.string().url().optional(),
  EVENT_BUS_HTTP_TOKEN: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info")
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.join(".") + ": " + issue.message);
    throw new Error("Invalid environment configuration:\n" + issues.join("\n"));
  }

  const env = parsed.data;
  if (env.NODE_ENV === "production" && env.TOKEN_ENCRYPTION_MODE !== "aws-kms") {
    throw new Error("Production requires TOKEN_ENCRYPTION_MODE=aws-kms.");
  }
  if (env.TOKEN_ENCRYPTION_MODE === "aws-kms" && !env.AWS_KMS_KEY_ID) {
    throw new Error("AWS_KMS_KEY_ID is required when AWS KMS encryption is enabled.");
  }
  if (env.TOKEN_ENCRYPTION_MODE === "local" && !env.TOKEN_ENCRYPTION_KEY_BASE64) {
    throw new Error("TOKEN_ENCRYPTION_KEY_BASE64 is required for local encryption.");
  }
  if (env.NODE_ENV === "production" && env.CORS_ALLOWED_ORIGINS.split(",").some((origin) => origin.trim() === "*")) {
    throw new Error("Wildcard CORS is prohibited in production.");
  }
  return env;
}
