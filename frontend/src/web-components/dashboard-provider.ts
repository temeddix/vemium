import { dashboardContext } from "@/app/context";
import { DashboardStore } from "@/app/state";
import { provide } from "@lit/context";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-dashboard-provider": DashboardProvider;
  }
}

@customElement("te-dashboard-provider")
export class DashboardProvider extends LitElement {
  @provide({ context: dashboardContext })
  @property({ attribute: false })
  accessor store: DashboardStore = new DashboardStore();

  override disconnectedCallback(): void {
    this.store.dispose();
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <slot></slot>
    `;
  }
}
