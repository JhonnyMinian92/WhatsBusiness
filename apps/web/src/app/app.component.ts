import { Component } from "@angular/core";

@Component({
  selector: "wb-root",
  standalone: true,
  template: `
    <main class="shell">
      <header class="topbar">
        <a class="brand" href="/" aria-label="WhatsBusiness inicio">
          <span class="brand-mark" aria-hidden="true">W</span>
          <span>WhatsBusiness</span>
        </a>
        <span class="environment">Entorno local</span>
      </header>
      <section class="welcome" aria-labelledby="welcome-title">
        <p class="eyebrow">PLATAFORMA DE COMUNICACIÓN Y CRECIMIENTO</p>
        <h1 id="welcome-title">Tu operación, conectada.</h1>
        <p class="intro">
          Estamos preparando la base segura de tu espacio de trabajo.
          La selección de organización estará disponible cuando la identidad y los permisos estén configurados.
        </p>
        <p class="notice" role="status">
          Foundation en construcción · No hay cuentas ni datos reales conectados.
        </p>
      </section>
      <footer>WhatsBusiness · es-EC · USD</footer>
    </main>
  `,
})
export class AppComponent {}
