import { createContext, useContext } from "react";

export const PageTitleContext = createContext({
  title: "",
  setTitle: () => {},
});

export function usePageTitle() {
  return useContext(PageTitleContext);
}
