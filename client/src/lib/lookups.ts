import { useQuery } from '@tanstack/react-query';
import { ENTITIES, type EntityKey } from '@aqualims/shared';
import { api, toQuery } from '../api/client';

export interface LookupItem {
  _id: string;
  label: string;
  inactive: boolean;
  columns: Record<string, string>;
  sortOrder: number;
  status: string | null;
  defaultUnitId: string | null;
}

export function lookupKey(entity: EntityKey, labelField?: string) {
  return ['lookup', entity, labelField ?? ''] as const;
}

export function useLookup(entity: EntityKey, labelField?: string, enabled = true) {
  return useQuery({
    queryKey: lookupKey(entity, labelField),
    queryFn: () => api<LookupItem[]>(`/lookups/${ENTITIES[entity].apiPath}${toQuery({ labelField })}`),
    staleTime: 30_000,
    enabled,
  });
}
