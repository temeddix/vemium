import type { DashboardStore } from "@/app/state";
import type { WorkspaceFile } from "@/app/types";
import { css, html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { createRef, type Ref, ref } from "lit/directives/ref.js";

declare global {
  interface HTMLElementTagNameMap {
    "te-room-files-dialog": RoomFilesDialog;
  }
}

interface DialogElement extends HTMLElement {
  open: boolean;
}

interface FolderNode {
  type: "folder";
  name: string;
  children: TreeNode[];
}

interface FileNode {
  type: "file";
  name: string;
  path: string;
  sizeBytes: number;
}

type TreeNode = FolderNode | FileNode;

/** Forward-slash path attribute used by the dblclick handler to find the
 * leaf the user activated. Set on every file `<wa-tree-item>`. */
const FILE_PATH_ATTR = "data-file-path";

/**
 * Modal that shows the room's workspace as a folder tree. Double-clicking a
 * file opens it in a new browser tab; the footer offers a one-click zip
 * download. The dialog refetches its listing each time `show()` is called
 * so the tree always reflects the current state of disk.
 */
@customElement("te-room-files-dialog")
export class RoomFilesDialog extends LitElement {
  @property({ attribute: false })
  accessor store!: DashboardStore;

  @state()
  private accessor roomCode: string | null = null;

  @state()
  private accessor files: WorkspaceFile[] = [];

  @state()
  private accessor loading = false;

  @state()
  private accessor errorText: string | null = null;

  #dialogRef: Ref<DialogElement> = createRef();

  static override styles = css`
    wa-dialog {
      --width: 40rem;
    }

    .toolbar {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.6rem;
    }

    .toolbar-hint {
      font-size: 0.78rem;
      color: var(--wa-color-text-quiet);
    }

    .tree-wrapper {
      max-height: 60vh;
      overflow: auto;
      border: var(--wa-border-width-s) solid var(--wa-color-border-normal);
      border-radius: 0.5rem;
      padding: 0.4rem;
    }

    .file-size {
      color: var(--wa-color-text-quiet);
      font-size: 0.78rem;
      margin-left: 0.4rem;
    }

    .empty {
      padding: 1rem;
      text-align: center;
      color: var(--wa-color-text-quiet);
    }

    .error-banner {
      padding: 0.5rem 0.75rem;
      border-radius: 0.5rem;
      background: var(--wa-color-danger-fill-quiet);
      color: var(--wa-color-danger-on-quiet);
      font-size: 0.85rem;
      margin-bottom: 0.6rem;
    }
  `;

  /** Open the dialog and load the file tree for `roomCode`. */
  async show(roomCode: string): Promise<void> {
    this.roomCode = roomCode;
    this.errorText = null;
    this.files = [];
    const dialog = this.#dialogRef.value;
    if (dialog !== undefined) {
      dialog.open = true;
    }
    await this.#refresh();
  }

  override render() {
    const code = this.roomCode;
    return html`
      <wa-dialog ${ref(this.#dialogRef)} label="Files">
        ${this.errorText !== null
          ? html`
            <div class="error-banner">${this.errorText}</div>
          `
          : nothing}
        <div class="toolbar">
          <span class="toolbar-hint">Double-click a file to open it.</span>
          <wa-button
            size="small"
            ?disabled="${code === null || this.loading}"
            @click="${this.#onDownload}"
          >
            <wa-icon slot="start" name="download"></wa-icon>
            Download zip
          </wa-button>
        </div>
        ${this.#renderBody()}
      </wa-dialog>
    `;
  }

  #renderBody() {
    if (this.loading) {
      return html`
        <div class="empty">Loading...</div>
      `;
    }
    if (this.files.length === 0) {
      return html`
        <div class="empty">No files in this workspace yet.</div>
      `;
    }
    const root = buildTree(this.files);
    return html`
      <div class="tree-wrapper" @dblclick="${this.#onTreeDblClick}">
        <wa-tree>
          ${root.children.map((node) => this.#renderNode(node))}
        </wa-tree>
      </div>
    `;
  }

  #renderNode(node: TreeNode): TemplateResult {
    if (node.type === "folder") {
      return html`
        <wa-tree-item>
          <wa-icon name="folder"></wa-icon>
          ${node.name} ${node.children.map((child) => this.#renderNode(child))}
        </wa-tree-item>
      `;
    }
    return html`
      <wa-tree-item data-file-path="${node.path}">
        <wa-icon name="file"></wa-icon>
        ${node.name}
        <span class="file-size">${formatSize(node.sizeBytes)}</span>
      </wa-tree-item>
    `;
  }

  async #refresh(): Promise<void> {
    const code = this.roomCode;
    if (code === null) {
      return;
    }
    this.loading = true;
    this.errorText = null;
    const files = await this.store.loadWorkspaceFiles(code);
    this.loading = false;
    if (files === null) {
      this.errorText = "Could not load the workspace.";
      this.files = [];
      return;
    }
    this.files = files;
  }

  #onTreeDblClick = (event: MouseEvent): void => {
    const code = this.roomCode;
    if (code === null) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const item = target.closest(`[${FILE_PATH_ATTR}]`);
    if (!(item instanceof HTMLElement)) {
      return;
    }
    const path = item.getAttribute(FILE_PATH_ATTR);
    if (path === null || path === "") {
      return;
    }
    const url = this.store.workspaceFileUrl(code, path);
    globalThis.open(url, "_blank", "noopener");
  };

  #onDownload = (): void => {
    const code = this.roomCode;
    if (code === null) {
      return;
    }
    const url = this.store.workspaceDownloadUrl(code);
    globalThis.open(url, "_blank", "noopener");
  };
}

function buildTree(files: WorkspaceFile[]): FolderNode {
  const root: FolderNode = { type: "folder", name: "", children: [] };
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    insertFile(root, file);
  }
  sortFolder(root);
  return root;
}

function insertFile(root: FolderNode, file: WorkspaceFile): void {
  const segments = file.path.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) {
    return;
  }
  let cursor: FolderNode = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const existing = cursor.children.find(
      (child): child is FolderNode =>
        child.type === "folder" && child.name === segment,
    );
    if (existing !== undefined) {
      cursor = existing;
      continue;
    }
    const folder: FolderNode = {
      type: "folder",
      name: segment,
      children: [],
    };
    cursor.children.push(folder);
    cursor = folder;
  }
  cursor.children.push({
    type: "file",
    name: segments[segments.length - 1],
    path: file.path,
    sizeBytes: file.sizeBytes,
  });
}

/** Folders before files, alphabetical within each group. */
function sortFolder(folder: FolderNode): void {
  folder.children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const child of folder.children) {
    if (child.type === "folder") {
      sortFolder(child);
    }
  }
}

const SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

function formatSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value.toString() : value.toFixed(1);
  return `${rounded} ${SIZE_UNITS[unit]}`;
}
