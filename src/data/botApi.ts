// The reference pages are built from the OpenAPI document the server generates from its own
// routes (`public/openapi.json`, written by `dotnet run -- bot-api openapi`). Nothing here
// describes the API; it only reshapes the specification into the flat rows the pages render.
//
// Everything specific to Argon travels as `x-argon-*` extensions, so this reads them as data
// rather than parsing them out of the prose in `description`.
import spec from '../../public/openapi.json';

export interface ErrorDoc {
  status: number;
  code: string;
  description: string;
}

export interface TypeProperty {
  name: string;
  type: string;
  isArray: boolean;
  isNullable: boolean;
  isCircular: boolean;
  properties?: TypeProperty[] | null;
  enumValues?: string[] | null;
}

export interface RouteDoc {
  method: string;
  path: string;
  description: string | null;
  permission: string | null;
  isPrivileged: boolean;
  requestIn: 'body' | 'query' | null;
  requestTypeName: string | null;
  requestTypeShape: TypeProperty[] | null;
  responseTypeName: string | null;
  responseTypeShape: TypeProperty[] | null;
  errors: ErrorDoc[];
}

export interface InterfaceDoc {
  name: string;
  version: number;
  description: string | null;
  isStable: boolean;
  isDeprecated: boolean;
  routes: RouteDoc[];
}

const schemas: Record<string, any> = (spec as any).components?.schemas ?? {};

function refName(schema: any): string | null {
  const ref = schema?.$ref;
  return typeof ref === 'string' ? ref.slice(ref.lastIndexOf('/') + 1) : null;
}

function resolve(schema: any): any {
  const name = refName(schema);
  return name ? schemas[name] ?? {} : schema ?? {};
}

/** The most useful name for a value: its format where it has one, its type otherwise. */
function typeName(schema: any): string {
  const named = refName(schema);
  if (named) return named;

  if (schema?.oneOf?.length)
    return schema.oneOf.map((variant: any) => typeName(variant)).join(' | ');

  return schema?.format ?? schema?.type ?? 'any';
}

function describeProperties(schema: any, seen: Set<string>): TypeProperty[] | null {
  const resolved = resolve(schema);
  if (!resolved.properties) return null;

  const required: string[] = resolved.required ?? [];

  return Object.entries(resolved.properties).map(([name, raw]: [string, any]) => {
    const isArray = raw.type === 'array';
    const value   = isArray ? raw.items ?? {} : raw;
    const named   = refName(value);

    // A type that contains itself — a channel group holding channel groups, say — is marked and
    // not followed, or the flattening would not terminate.
    const isCircular = named !== null && seen.has(named);
    const nested     = named !== null && !isCircular
      ? describeProperties(value, new Set([...seen, named]))
      : null;

    return {
      name,
      type: typeName(value),
      isArray,
      isNullable: (raw.nullable ?? value.nullable ?? false) || !required.includes(name),
      isCircular,
      properties: nested,
      enumValues: resolve(value).enum ?? null,
    };
  });
}

/** Query parameters read as a request shape, since that is what they are to a caller. */
function describeParameters(parameters: any[]): TypeProperty[] {
  return parameters.map(parameter => {
    const schema  = parameter.schema ?? {};
    const isArray = schema.type === 'array';
    const value   = isArray ? schema.items ?? {} : schema;

    return {
      name: parameter.name,
      type: typeName(value),
      isArray,
      isNullable: !parameter.required,
      isCircular: false,
      properties: null,
      enumValues: resolve(value).enum ?? null,
    };
  });
}

function jsonSchemaOf(content: any): any | null {
  const media = content?.['application/json'] ?? Object.values(content ?? {})[0];
  return (media as any)?.schema ?? null;
}

function toRoute(path: string, method: string, operation: any): RouteDoc {
  const parameters = operation.parameters ?? [];
  const bodySchema = jsonSchemaOf(operation.requestBody?.content);
  const okSchema   = jsonSchemaOf(operation.responses?.['200']?.content);

  const requestIn = bodySchema ? 'body' : parameters.length > 0 ? 'query' : null;

  return {
    method: method.toUpperCase(),
    path: `/${path.slice(path.lastIndexOf('/') + 1)}`,
    description: operation.summary ?? null,
    permission: operation['x-argon-permission'] ?? null,
    isPrivileged: operation['x-argon-privileged'] === true,
    requestIn,
    requestTypeName: bodySchema ? typeName(bodySchema) : requestIn === 'query' ? 'query' : null,
    requestTypeShape: bodySchema
      ? describeProperties(bodySchema, new Set([refName(bodySchema) ?? '']))
      : requestIn === 'query'
        ? describeParameters(parameters)
        : null,
    responseTypeName: okSchema ? typeName(okSchema) : null,
    responseTypeShape: okSchema ? describeProperties(okSchema, new Set([refName(okSchema) ?? ''])) : null,
    errors: operation['x-argon-errors'] ?? [],
  };
}

function build(): InterfaceDoc[] {
  const byName = new Map<string, InterfaceDoc>();
  const tags: Record<string, string> = Object.fromEntries(
    ((spec as any).tags ?? []).map((tag: any) => [tag.name, tag.description]));

  for (const [path, item] of Object.entries((spec as any).paths ?? {})) {
    // "/IMessages/v1/Send" — the interface and its version are the path, which is also the only
    // place a client ever sees them.
    const [, name, version] = path.split('/');

    for (const [method, operation] of Object.entries(item as any)) {
      const existing = byName.get(name) ?? {
        name,
        version: Number(version.replace(/^v/, '')),
        description: tags[name] ?? null,
        // A dated version (v20260401) is a preview that may still change; a counted one (v1) is
        // published and only ever grows a v2.
        isStable: Number(version.replace(/^v/, '')) < 1000,
        isDeprecated: false,
        routes: [],
      };

      existing.isDeprecated ||= (operation as any).deprecated === true;
      existing.routes.push(toRoute(path, method, operation));
      byName.set(name, existing);
    }
  }

  for (const iface of byName.values())
    iface.routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const interfaces: InterfaceDoc[] = build();

export const routeCount = interfaces.reduce((total, iface) => total + iface.routes.length, 0);
