import { createContext, useContext } from 'react';
import type { EntityDef } from '@aqualims/shared';

export interface ChildRow {
  _key: string;
  _id?: string;
  _labels?: Record<string, string>;
  _inactive?: Record<string, boolean>;
  [field: string]: any;
}

export interface FormApi {
  def: EntityDef;
  values: Record<string, any>;
  labels: Record<string, string>;
  setValue: (name: string, value: any, label?: string) => void;
  children: Record<string, ChildRow[]>;
  setChildRows: (name: string, update: ChildRow[] | ((rows: ChildRow[]) => ChildRow[])) => void;
  errors: Record<string, string>;
  clearError: (path: string) => void;
  record: any | null;
  isNew: boolean;
  recordId: string | null;
  level: number;
  lockedFields: Set<string>;
  extras: Record<string, any>;
  setExtra: (key: string, value: any) => void;
}

export const FormContext = createContext<FormApi | null>(null);

export function useForm(): FormApi {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('useForm outside a form');
  return ctx;
}

let keySeq = 0;
export const newRowKey = () => `new-${Date.now()}-${++keySeq}`;
