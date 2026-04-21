import { css, html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import "./dashboard-provider.ts";
import "./dashboard-view.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-app-shell": AppShell;
  }
}

@customElement("te-app-shell")
export class AppShell extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
  `;

  override render() {
    return html`
      <te-dashboard-provider>
        <te-dashboard-view></te-dashboard-view>
      </te-dashboard-provider>
    `;
  }
}
