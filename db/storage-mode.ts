export function storageMode(env: NodeJS.ProcessEnv = process.env): "local" | "azure" {
  const onAzure = Boolean(env.WEBSITE_INSTANCE_ID);
  const requested = env.DATA_BACKEND;
  if (requested && requested !== "local" && requested !== "azure") throw new Error("Invalid DATA_BACKEND");
  if (onAzure && requested === "local") throw new Error("Local storage is disabled on Azure");
  if (!onAzure && requested === "azure") throw new Error("Azure storage is disabled outside Azure App Service");
  return onAzure ? "azure" : "local";
}
