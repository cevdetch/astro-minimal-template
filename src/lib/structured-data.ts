// Builders for the schema.org nodes the layout emits. Each node stands on its
// own: search engines read one page at a time, so a node that credits a person
// repeats the name and url inline rather than relying on another page.
//
// Add builders here for the types your content calls for (Article,
// BreadcrumbList). FAQ and HowTo are not worth adding: Google no longer shows
// those results.

import type { Graph, Person, SoftwareSourceCode, Thing, WebSite } from 'schema-dts';

type Node<T> = Exclude<T, string>;

/** Who a page credits: a name and the person's own site. */
export interface PersonRef {
  name: string;
  url: string;
}

/** `url` with `#fragment`, the form every @id here takes: https://example.com/#website. */
export function nodeId(url: string | URL, fragment: string): string {
  const id = new URL(url);
  id.hash = fragment;
  return id.href;
}

/** A Person by @id, name and url: enough for a search engine to credit an author. */
export function personReference(person: PersonRef): Node<Person> {
  return { '@type': 'Person', '@id': nodeId(person.url, 'person'), name: person.name, url: person.url };
}

export interface WebSiteInput {
  /** The home page URL; the node's @id is this URL with #website. */
  url: string;
  name: string;
  inLanguage?: string | undefined;
  publisher?: PersonRef | undefined;
}

/** The home page's WebSite, which Google reads for the site name. Only on the root of a domain or subdomain. */
export function websiteNode(input: WebSiteInput): Node<WebSite> {
  return {
    '@type': 'WebSite', '@id': nodeId(input.url, 'website'), url: input.url, name: input.name,
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    ...(input.publisher ? { publisher: personReference(input.publisher) } : {}),
  };
}

export interface SoftwareSourceCodeInput {
  /** The page that describes the code; the node's @id is this URL with #code. */
  url: string;
  name: string;
  /** Public repository URL. */
  codeRepository: string;
  programmingLanguage?: string | readonly string[] | undefined;
  /** SPDX identifier, e.g. MIT; written as its spdx.org URL. */
  license?: string | undefined;
  author?: PersonRef | undefined;
}

/** A project's source code. Descriptive only: Google shows no rich result for it. */
export function softwareSourceCodeNode(input: SoftwareSourceCodeInput): Node<SoftwareSourceCode> {
  return {
    '@type': 'SoftwareSourceCode', '@id': nodeId(input.url, 'code'), url: input.url, mainEntityOfPage: input.url,
    name: input.name, codeRepository: input.codeRepository,
    ...(input.programmingLanguage ? { programmingLanguage: input.programmingLanguage } : {}),
    ...(input.license ? { license: `https://spdx.org/licenses/${input.license}.html` } : {}),
    ...(input.author ? { author: personReference(input.author) } : {}),
  };
}

/** One page's nodes in a single script element. */
export function graph(...nodes: readonly Node<Thing>[]): Graph {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/** JSON for a <script type="application/ld+json">; escaping < keeps the text from closing the element. */
export function serializeJsonLd(value: Graph | Node<Thing>): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
