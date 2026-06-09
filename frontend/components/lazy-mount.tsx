"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type LazyMountProps = {
  children: ReactNode;
  /** 미리 로드할 뷰포트 여유 거리. 기본 200px 전에 마운트. */
  rootMargin?: string;
  /** 마운트 전 표시할 자리표시자. */
  placeholder?: ReactNode;
};

/**
 * 자식을 뷰포트에 근접했을 때만 마운트합니다.
 * below-the-fold 영역의 초기 렌더/네트워크 호출을 미뤄 첫 화면을 빠르게 합니다.
 */
export function LazyMount({
  children,
  rootMargin = "200px",
  placeholder = null,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return <div ref={ref}>{visible ? children : placeholder}</div>;
}
