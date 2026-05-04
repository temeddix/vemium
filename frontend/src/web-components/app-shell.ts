import { Router } from "@lit-labs/router";
import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./dashboard-provider.ts";
import "./room-chat-page.ts";
import "./room-list-page.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-app-shell": AppShell;
  }
}

/**
 * Top-level component. Wraps the routed outlet in the dashboard provider
 * so context (the shared store) is available everywhere underneath. The
 * router is owned here so the URL is the single source of truth for
 * which page is shown.
 */
@customElement("te-app-shell")
export class AppShell extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  #router = new Router(this, [
    {
      path: "/",
      render: () =>
        html`
          <te-room-list-page></te-room-list-page>
        `,
    },
    {
      path: "/room/:slug",
      render: (params) =>
        html`
          <te-room-chat-page slug="${params["slug"] ?? ""}"></te-room-chat-page>
        `,
    },
  ]);

  override render() {
    return html`
      <te-dashboard-provider>
        ${this.#router.outlet()}
      </te-dashboard-provider>
    `;
  }
}
