import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Page } from 'puppeteer-core';

export interface CapabilityRule {
  role: string;
  names: string[];
  scope?: 'page' | 'dialog';
  preferLast?: boolean;
}

export interface CapabilitySet {
  select: CapabilityRule;
  action: CapabilityRule;
  confirm: CapabilityRule;
}

interface AxNode {
  nodeId: string;
  ignored: boolean;
  role?: { value?: string };
  name?: { value?: string };
  backendDOMNodeId?: number;
  parentId?: string;
}

export function loadCapabilities(filePath: string): CapabilitySet {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid capabilities file: ${filePath}`);
  }

  const candidate = parsed as Partial<CapabilitySet>;
  for (const key of ['select', 'action', 'confirm'] as const) {
    const rule = candidate[key];
    if (
      !rule ||
      typeof rule.role !== 'string' ||
      !Array.isArray(rule.names) ||
      rule.names.some((name) => typeof name !== 'string')
    ) {
      throw new Error(`Invalid capability "${key}" in ${filePath}`);
    }
  }

  return candidate as CapabilitySet;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchesName(nodeName: string, names: string[]): boolean {
  const normalizedName = normalize(nodeName);
  const normalizedNames = names.map(normalize).filter(Boolean);

  if (normalizedNames.some((name) => normalizedName === name)) {
    return true;
  }

  return normalizedNames.some((name) => name.length >= 6 && normalizedName.includes(name));
}

function isInsideDialog(node: AxNode, byId: Map<string, AxNode>): boolean {
  let current = node.parentId ? byId.get(node.parentId) : undefined;

  for (let depth = 0; current && depth < 12; depth += 1) {
    const role = normalize(current.role?.value);
    if (role === 'dialog' || role === 'alertdialog') {
      return true;
    }
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return false;
}

/**
 * Resolves a control by accessibility role and name instead of translated DOM
 * text, then clicks it through CDP. This keeps working across UI languages and
 * survives most DOM class-name churn.
 */
export async function invokeCapability(
  page: Page,
  rule: CapabilityRule,
  timeoutMs = 6_000,
): Promise<boolean> {
  const client = await page.createCDPSession();
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const { nodes } = (await client.send('Accessibility.getFullAXTree')) as {
        nodes: AxNode[];
      };
      const byId = new Map(nodes.map((node) => [node.nodeId, node]));
      const wantedRole = normalize(rule.role);
      const candidates = nodes.filter((node) => {
        if (node.ignored || node.backendDOMNodeId === undefined) {
          return false;
        }
        if (rule.scope === 'dialog' && !isInsideDialog(node, byId)) {
          return false;
        }
        return matchesName(node.name?.value ?? '', rule.names);
      });
      // Instagram often exposes labels as StaticText, so prefer a role match but
      // accept a name-only match and climb to the nearest clickable ancestor.
      const roleMatches = candidates.filter((node) => normalize(node.role?.value) === wantedRole);
      const pool = roleMatches.length > 0 ? roleMatches : candidates;
      const match = rule.preferLast ? pool.at(-1) : pool[0];

      if (match?.backendDOMNodeId !== undefined) {
        try {
          const { object } = (await client.send('DOM.resolveNode', {
            backendNodeId: match.backendDOMNodeId,
          })) as { object: { objectId?: string } };
          if (!object.objectId) {
            return false;
          }
          await client.send('Runtime.callFunctionOn', {
            objectId: object.objectId,
            functionDeclaration: `function () {
              const start = this.nodeType === 3 ? this.parentElement : this;
              const target =
                start &&
                (start.closest('button,[role="button"],a,[tabindex="0"],input') || start);
              if (target) {
                target.click();
              }
            }`,
          });
          return true;
        } catch {
          return false;
        }
      }

      await sleep(250);
    }

    return false;
  } finally {
    await client.detach().catch(() => undefined);
  }
}
