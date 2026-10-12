export function findSchemaViolations(value: unknown, schema: Record<string, unknown>, path = ""): string[] {
  const problems: string[] = [];
  const label = path || "(root)";

  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return [`${label} (expected an object)`];
    }
    const obj = value as Record<string, unknown>;
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    if(schema.additionalProperties===false)for(const key of Object.keys(obj))if(!(key in properties))problems.push(`${label}.${key} (unexpected field)`);
    for (const key of new Set([...required,...Object.keys(properties).filter(k=>obj[k]!==undefined)])) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (obj[key] === undefined) {
        problems.push(`${fieldPath} (missing)`);
        continue;
      }
      if (properties[key]) {
        problems.push(...findSchemaViolations(obj[key], properties[key], fieldPath));
      }
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) {
      return [`${label} (expected an array)`];
    }
    if(typeof schema.minItems==="number" && value.length<schema.minItems)problems.push(`${label} (too few items)`);
    if(typeof schema.maxItems==="number" && value.length>schema.maxItems)problems.push(`${label} (too many items)`);
    if (schema.items) {
      value.forEach((item, i) => {
        problems.push(...findSchemaViolations(item, schema.items as Record<string, unknown>, `${path}[${i}]`));
      });
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") problems.push(`${label} (expected a string)`);
    else {if(typeof schema.minLength==="number" && value.length<schema.minLength)problems.push(`${label} (too short)`);if(typeof schema.maxLength==="number" && value.length>schema.maxLength)problems.push(`${label} (too long)`);}
  } else if (schema.type === "integer" || schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type==="integer" && !Number.isInteger(value))) problems.push(`${label} (expected a finite ${schema.type})`);
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") problems.push(`${label} (expected a boolean)`);
  }

  if(typeof value==="number"){if(typeof schema.minimum==="number" && value<schema.minimum)problems.push(`${label} (below minimum)`);if(typeof schema.maximum==="number" && value>schema.maximum)problems.push(`${label} (above maximum)`);}
  if(Array.isArray(schema.enum) && !schema.enum.includes(value))problems.push(`${label} (invalid enum value)`);
  return problems;
}
