/**
 * A featured story: paragraphs of sentences, each followed by numbered citation markers. A marker
 * hands its item's qid to the box, which highlights and scrolls to it (null means the lists).
 */
import type { PublishedStory } from "../../lib/narrative/publish.ts";
import styles from "./globe.module.css";

export function Story({ story, onCite }: { story: PublishedStory; onCite: (qid: string | null) => void }) {
  // The same ref keeps the same number all the way through, numbered by first appearance.
  const numbers = new Map<string, number>();
  for (const para of story.paragraphs)
    for (const sentence of para) for (const c of sentence.cites) if (!numbers.has(c.ref)) numbers.set(c.ref, numbers.size + 1);

  return (
    <div className={styles.story}>
      {story.paragraphs.map((para, i) => (
        <p key={i}>
          {para.map((sentence, j) => {
            // The last word and the markers stay on one line, so a marker never starts a line alone.
            const cut = sentence.text.lastIndexOf(" ") + 1;
            return (
              <span key={j}>
                {sentence.text.slice(0, cut)}
                <span className={styles.noWrap}>
                  {sentence.text.slice(cut)}
                  {sentence.cites.map((c) => (
                    <button key={c.ref} type="button" className={styles.cite} aria-label={c.label} title={c.label} onClick={() => onCite(c.qid)}>
                      {numbers.get(c.ref)}
                    </button>
                  ))}
                </span>{" "}
              </span>
            );
          })}
        </p>
      ))}
      <p className={styles.storyCredit}>
        Written by Claude from the <a href="https://en.wikipedia.org">Wikipedia</a> (CC BY-SA) and <a href="https://www.wikidata.org">Wikidata</a> text of the items
        cited. Featured story, {story.writtenAt.slice(0, 10)}.
      </p>
    </div>
  );
}
