import { createContext, useContext, useState, type ReactNode } from 'react';

interface SearchValue {
  query: string;
  setQuery: (q: string) => void;
}

const SearchContext = createContext<SearchValue>({ query: '', setQuery: () => undefined });

// The header's "Text to search…" box filters the list screen that is open.
export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  return <SearchContext.Provider value={{ query, setQuery }}>{children}</SearchContext.Provider>;
}

export const useGlobalSearch = () => useContext(SearchContext);
