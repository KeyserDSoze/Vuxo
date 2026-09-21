import { getApiBaseUrl } from '../character/appearance';

export type FrontendBuildInfo = {
  version: string;
  commit: string;
  buildDateUtc: string;
};

export type BackendBuildInfo = {
  application: string;
  version: string;
  informationalVersion: string | null;
  commit: string;
  buildDateUtc: string | null;
  environment: string;
};

function requiredString(payload: Record<string, unknown>, field: string): string {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`build_metadata_${field}_invalid`);
  }
  return value;
}

function optionalString(payload: Record<string, unknown>, field: string): string | null {
  const value = payload[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function fetchFrontendBuildInfo(signal?: AbortSignal): Promise<FrontendBuildInfo> {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`frontend_build_metadata_${response.status}`);

  const payload = await response.json() as Record<string, unknown>;
  return {
    version: requiredString(payload, 'version'),
    commit: requiredString(payload, 'commit'),
    buildDateUtc: requiredString(payload, 'buildDateUtc')
  };
}

export async function fetchBackendBuildInfo(signal?: AbortSignal): Promise<BackendBuildInfo> {
  const response = await fetch(`${getApiBaseUrl()}/api/meta/version`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`backend_build_metadata_${response.status}`);

  const payload = await response.json() as Record<string, unknown>;
  return {
    application: requiredString(payload, 'application'),
    version: requiredString(payload, 'version'),
    informationalVersion: optionalString(payload, 'informationalVersion'),
    commit: requiredString(payload, 'commit'),
    buildDateUtc: optionalString(payload, 'buildDateUtc'),
    environment: requiredString(payload, 'environment')
  };
}

export function isSameFrontendBuild(left: FrontendBuildInfo, right: FrontendBuildInfo): boolean {
  return left.version === right.version
    && left.commit === right.commit
    && left.buildDateUtc === right.buildDateUtc;
}
