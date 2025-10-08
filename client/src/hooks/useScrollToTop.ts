import { useEffect, RefObject } from "react";

export function useScrollToTop(scrollRef: RefObject<HTMLElement>, dependency: any) {
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, Array.isArray(dependency) ? [...dependency, scrollRef] : [dependency, scrollRef]);
}
