export const COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION =
  "REZNO_COMMERCE_PRODUCTS_INVENTORY_STAGE3B_STAGING_SMOKE_ONLY";

export function assertCommerceProductsInventoryStage3bSmokeSafety(input: {
  authBaseUrl: string;
  baseUrl: string;
  confirmation: string | undefined;
  database: string;
  vercelEnvironment: string | undefined;
}) {
  if (input.confirmation !== COMMERCE_PRODUCTS_INVENTORY_STAGE3B_SMOKE_CONFIRMATION) {
    throw new Error("Stage 3B staging smoke confirmation is missing or invalid.");
  }
  if (input.database !== "rezno_staging") {
    throw new Error("Stage 3B staging smoke requires the exact rezno_staging database.");
  }
  if (input.vercelEnvironment !== "preview") {
    throw new Error("Stage 3B staging smoke may run only against a Vercel preview build.");
  }

  const preview = safeUrl(input.baseUrl, "Stage 3B preview URL");
  if (
    preview.protocol !== "https:" ||
    !/^rezno-staging-[a-z0-9]+-rafidedu\.vercel\.app$/.test(preview.hostname)
  ) {
    throw new Error("Stage 3B staging smoke requires an exact rezno-staging preview URL.");
  }

  const auth = safeUrl(input.authBaseUrl, "Stage 3B auth URL");
  if (auth.protocol !== "https:" || auth.hostname !== "rezno-staging.vercel.app") {
    throw new Error("Stage 3B staging smoke requires the exact staging auth origin.");
  }
}

export function parseCommerceProductsInventoryStage3bForm(form: string) {
  const parameters = new URLSearchParams();
  for (const input of form.match(/<input\b[^>]*>/g) ?? []) {
    const name = attribute(input, "name");
    if (!name || disabled(input)) continue;
    if (input.includes('type="checkbox"') && !/\schecked(?:=""|(?=\s|>))/.test(input)) continue;
    parameters.append(name, input.includes('type="checkbox"') ? attribute(input, "value") || "on" : attribute(input, "value"));
  }
  for (const textarea of form.match(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/g) ?? []) {
    const name = attribute(textarea, "name");
    if (name && !disabled(textarea)) {
      parameters.append(name, decodeHtml(textarea.replace(/^<textarea\b[^>]*>/, "").replace(/<\/textarea>$/, "")));
    }
  }
  for (const select of form.match(/<select\b[^>]*>[\s\S]*?<\/select>/g) ?? []) {
    const name = attribute(select, "name");
    if (!name || disabled(select)) continue;
    const options = select.match(/<option\b[^>]*>[\s\S]*?<\/option>/g) ?? [];
    const option = options.find((candidate) => /\sselected(?:=""|(?=\s|>))/.test(candidate) && !disabled(candidate))
      ?? options.find((candidate) => !disabled(candidate));
    if (option) parameters.append(name, attribute(option, "value") || decodeHtml(option.replace(/^<option\b[^>]*>/, "").replace(/<\/option>$/, "")));
  }
  return parameters;
}

function disabled(element: string) {
  return /\sdisabled(?:=""|(?=\s|>))/.test(element);
}

function decodeHtml(value: string) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function attribute(element: string, name: string) {
  return decodeHtml(element.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? "");
}

function safeUrl(value: string, label: string) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is invalid.`);
  }
}
