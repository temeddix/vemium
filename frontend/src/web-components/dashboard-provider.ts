import { provide } from "@lit/context";
import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

import { dashboardContext } from "#context";
import { DashboardStore } from "#state";

import { UpdateEffectController } from "./update-effect-controller.ts";

declare global {
  interface HTMLElementTagNameMap {
    "te-dashboard-provider": DashboardProviderElement;
  }
}

@customElement("te-dashboard-provider")
export class DashboardProviderElement extends LitElement {
  @provide({ context: dashboardContext })
  @property({ attribute: false })
  accessor store: DashboardStore = new DashboardStore();

  lifetime: UpdateEffectController = new UpdateEffectController(
    this,
  ).onDisconnected((): void => {
    this.store.dispose();
  });

  override render(): TemplateResult {
    return html`
      <slot></slot>
    `;
  }
}
