import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error("WhatsBusiness web application failed to bootstrap", error);
});
