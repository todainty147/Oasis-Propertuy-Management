"use client";

import { useEffect, useRef, useState } from "react";

import { walkthroughScenes } from "./demoTeaserData";
import { ProductTeaserFrame } from "./ProductTeaserFrame";
import { TeaserMetricCard } from "./TeaserMetricCard";
import { TeaserQueueItem } from "./TeaserQueueItem";
import { useTeaserSequence } from "./useTeaserSequence";

export function ProductWalkthroughModal({
  label = "Watch product preview",
  initialScene = "command-center",
}: {
  label?: string;
  initialScene?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sequence = useTeaserSequence(walkthroughScenes.length, 4200);
  const activeScene = walkthroughScenes[sequence.activeIndex];
  const initialSceneIndex = Math.max(
    walkthroughScenes.findIndex((scene) => scene.key === initialScene),
    0,
  );

  useEffect(() => {
    if (!isOpen) return undefined;

    const originalOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }

      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );

        if (!focusable?.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="button button-secondary product-walkthrough__trigger"
        onClick={() => {
          sequence.setActiveIndex(initialSceneIndex);
          setIsOpen(true);
        }}
      >
        {label}
      </button>

      {isOpen ? (
        <div
          className="product-walkthrough"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            ref={dialogRef}
            className="product-walkthrough__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-walkthrough-title"
          >
            <div className="product-walkthrough__top">
              <div>
                <span className="product-teaser__eyebrow">{activeScene.eyebrow}</span>
                <h2 id="product-walkthrough-title">{activeScene.title}</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="product-walkthrough__icon-button"
                onClick={() => setIsOpen(false)}
                aria-label="Close product preview"
              >
                x
              </button>
            </div>

            <div className="product-walkthrough__layout">
              <ProductTeaserFrame title={activeScene.eyebrow} compact>
                <div className="product-walkthrough__scene">
                  <p>{activeScene.body}</p>
                  <div className="product-walkthrough__metrics">
                    {activeScene.metrics.map((metric) => (
                      <TeaserMetricCard key={metric.label} metric={metric} />
                    ))}
                  </div>
                  <ol className="teaser-queue">
                    {activeScene.queue.map((item, index) => (
                      <TeaserQueueItem key={item.title} item={item} active={index === 0} />
                    ))}
                  </ol>
                </div>
              </ProductTeaserFrame>

              <div className="product-walkthrough__controls">
                <div className="product-walkthrough__steps" aria-label="Product preview scenes">
                  {walkthroughScenes.map((scene, index) => (
                    <button
                      key={scene.key}
                      type="button"
                      className={index === sequence.activeIndex ? "is-active" : ""}
                      onClick={() => sequence.setActiveIndex(index)}
                      aria-label={`Show ${scene.eyebrow}`}
                    />
                  ))}
                </div>
                <div className="product-walkthrough__button-row">
                  <button type="button" className="button button-secondary" onClick={sequence.previous}>
                    Previous
                  </button>
                  <button type="button" className="button button-secondary" onClick={sequence.togglePaused}>
                    {sequence.isPaused ? "Play" : "Pause"}
                  </button>
                  <button type="button" className="button button-primary" onClick={sequence.next}>
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
