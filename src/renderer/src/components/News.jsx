import { useEffect } from 'react'
import PropTypes from 'prop-types'
import { APP_VERSION, HOME_URL, NEWS_ITEMS, NEWS_SEEN_KEY } from '../lib/newsData'

// The News tab: what's new in this version, earlier releases, and a link to
// check for updates. Future updates just need a new item at the top of
// NEWS_ITEMS (src/renderer/src/lib/newsData.js).
export default function News({ onSeen }) {
  const latest = NEWS_ITEMS[0]

  // Remember that the user looked at the newest item, so the red dot on the
  // News tab disappears until the next update arrives.
  useEffect(() => {
    try {
      localStorage.setItem(NEWS_SEEN_KEY, latest.id)
    } catch {
      /* storage unavailable — the badge simply stays on */
    }
    if (onSeen) onSeen(latest.id)
  }, [latest.id, onSeen])

  return (
    <div className="doc-wrap news-view">
      <div className="doc-hero">
        <div className="doc-hero-title">📣 What’s new in DKN</div>
        <div className="doc-hero-sub">
          You are running DKN {APP_VERSION}. This is where updates are announced — check back here
          after every update.
        </div>
        <a className="check-updates-btn" href={HOME_URL} target="_blank" rel="noreferrer">
          🌐 Check for updates
        </a>
      </div>

      <article className={'news-card latest' + (latest.tag ? ' tagged' : '')}>
        <div className="news-head">
          <span className="news-version">Version {latest.version}</span>
          <span className="news-date">{latest.date}</span>
          {latest.tag && <span className="news-tag">{latest.tag}</span>}
        </div>
        <h2>{latest.title}</h2>
        <ul className="news-bullets">
          {latest.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </article>

      <section className="news-history">
        <h3>Earlier releases</h3>
        {NEWS_ITEMS.slice(1).map((item) => (
          <article className="news-card" key={item.id}>
            <div className="news-head">
              <span className="news-version">Version {item.version}</span>
              <span className="news-date">{item.date}</span>
            </div>
            <h2>{item.title}</h2>
            <ul className="news-bullets">
              {item.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="news-about">
        <h3>About DKN {APP_VERSION}</h3>
        <p>
          DKN is a free, offline storyboarding app for novelists. Your story, pictures, card layout
          and story calendar all travel together in one .dknproj file — nothing is uploaded anywhere
          unless you choose to translate.
        </p>
        <p>
          Ideas for the next update? Ask on the{' '}
          <a href={HOME_URL} target="_blank" rel="noreferrer">
            DKN homepage
          </a>
          .
        </p>
      </section>

      <footer className="doc-foot">
        DKN {APP_VERSION} · made by Nisarg M Patel · free forever
      </footer>
    </div>
  )
}

News.propTypes = { onSeen: PropTypes.func }
