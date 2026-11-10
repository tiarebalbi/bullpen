import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "../components/Footer.js";
import { JsonLd } from "../components/JsonLd.js";
import { PRIVACY_UPDATED, formatLongDate } from "../lib/contentDates.js";

const TITLE = "Privacy: what Bullpen collects, and why";
const DESCRIPTION =
  "What Bullpen collects with Google Analytics 4 and Microsoft Clarity, the cookies they set and how long they last, that advertising is off, and how to change your choice.";

// The same image as the home page: a page that sets its own openGraph does not
// inherit the root opengraph-image file, so it is named here.
const SHARE_IMAGE = {
  url: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Bullpen: Architecting Software in 2026, Built in Public",
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/privacy",
    siteName: "Bullpen",
    type: "website",
    locale: "en_US",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE] },
};

// A static page: nothing here reads the request.
export const dynamic = "force-static";

const COOKIES: Array<{ name: string; setBy: string; purpose: string; lasts: string }> = [
  { name: "bullpen_consent", setBy: "Bullpen (me)", purpose: "Remembers whether you accepted or rejected analytics.", lasts: "6 months" },
  { name: "_ga", setBy: "Google Analytics", purpose: "Tells visitors apart.", lasts: "2 years" },
  { name: "_ga_<container id>", setBy: "Google Analytics", purpose: "Keeps the state of your session.", lasts: "2 years" },
  { name: "_clck", setBy: "Microsoft Clarity", purpose: "Keeps a pseudonymous visitor ID.", lasts: "1 year" },
  { name: "_clsk", setBy: "Microsoft Clarity", purpose: "Joins your page views into one session recording.", lasts: "1 day" },
];

// The sign-in cookies, named as the Neon Auth SDK (@neondatabase/auth) sets them in the trading app (its constants NEON_AUTH_SESSION_COOKIE_NAME, NEON_AUTH_SESSION_DATA_COOKIE_NAME
// and NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME). All three are HttpOnly, Secure and SameSite=Lax. session_data is made by the SDK with its default lifetime of 300 seconds (the app sets none);
// session_token and session_challenge come from Neon Auth's server, so their lifetimes are not in the SDK. session_token: the owner read neon_auth.session in the production database with a
// read-only query on 2026-11-10: 12 sessions, and each lasted (expiresAt minus createdAt) from 6 days 23:59:59.999 to 12 days 04:38:07, so 7 days, extended while the session is used.
// The challenge's lifetime has not been read from a live response.
const SIGN_IN_COOKIES: Array<{ name: string; setBy: string; purpose: string; lasts: string }> = [
  {
    name: "__Secure-neon-auth.session_token",
    setBy: "Neon Auth, through the trading app",
    purpose: "Essential, and set only when you sign in. It is what keeps you signed in: the token of your sign-in session.",
    lasts: "7 days, extended while you keep using it",
  },
  {
    name: "__Secure-neon-auth.local.session_data",
    setBy: "The trading app, with the Neon Auth SDK",
    purpose:
      "Essential, and set only when you sign in. A short-lived, signed copy of your session, which includes your name, email address and profile picture, so the trading app doesn\u2019t ask Neon Auth on every request. Scripts on the page can\u2019t read it.",
    lasts: "Up to 5 minutes at a time, renewed while you stay signed in; removed when you sign out",
  },
  {
    name: "__Secure-neon-auth.session_challenge",
    setBy: "Neon Auth, through the trading app",
    purpose: "Essential, and set only when you sign in. Used for the round trip to GitHub: it lets the trading app check that you are the one coming back from GitHub.",
    lasts: "Set by Neon Auth\u2019s server for the round trip to GitHub",
  },
];

export default function PrivacyPage(): ReactNode {
  return (
    <>
      <JsonLd page="privacy" parts={[]} />
      <header className="bp-nav">
        <div className="bp-nav__brand">
          <Link href="/" className="bp-nav__wordmark bp-nav__wordmark--link">
            Bullpen
          </Link>
          <a href="https://tiarebalbi.com" className="bp-nav__byline">
            by Tiarê Balbi
          </a>
        </div>
        <div className="bp-nav__spacer" />
        <Link href="/" className="bp-nav__series-link bp-privacy__back">
          Back to Bullpen
        </Link>
      </header>

      <main className="bp-section bp-privacy">
        <div className="bp-section__head">
          <div className="bp-eyebrow">Privacy</div>
          <h1 className="bp-privacy__title">What I collect, and why</h1>
          <p className="bp-section__lede">
            Bullpen is a project I build in public. You can sign in to the trading app with GitHub. The
            trading app&rsquo;s own data holds only a neutral player label and, if you choose one, your handle,
            tied to your account by an id. Sign-in is handled by Neon Auth, which keeps, in its own tables, your
            account&rsquo;s name, email address and profile picture, the GitHub account&rsquo;s id and the tokens
            GitHub issues for the sign-in, and a record of each session, which includes the IP address and
            browser it was started from. It keeps them so you can sign in. Bullpen never shows any of that. If
            you accept, two analytics tools measure how the site is used. If you don&rsquo;t, they never
            load.
          </p>
          <p className="bp-privacy__updated">Last updated {formatLongDate(PRIVACY_UPDATED)}</p>
        </div>

        <div className="bp-privacy__body">
          <section aria-labelledby="privacy-collect">
            <h2 id="privacy-collect">What I collect</h2>
            <p>
              Nothing, until you choose. If you accept, these two tools run on the landing site and in the
              trading app:
            </p>
            <ul>
              <li>
                <strong>Google Analytics 4</strong> records the pages you view and a few interactions, listed
                below, along with technical details such as your browser, device type, where you came from
                and an approximate location.
              </li>
              <li>
                <strong>Microsoft Clarity</strong> records how you move around a page: clicks, scrolling and
                mouse movement, shown to me as heatmaps and session recordings. What you type into form
                fields is masked, so it is not recorded.
              </li>
            </ul>
            <p>
              Besides page views, I send four kinds of event: which part of the series you open, which parts
              of the architecture explorer you move between, which decision you open, and which other site a
              link takes you to. For that last one I send only the site&rsquo;s host name, never the full
              address. No event carries your name, an email address or anything you typed.
            </p>
          </section>

          <section aria-labelledby="privacy-why">
            <h2 id="privacy-why">Why</h2>
            <p>
              I want to know how the site is used: which parts of the series people read, whether the
              architecture explorer makes sense, and where a page breaks on a phone. I use it to fix things
              and decide what to write next.
            </p>
          </section>

          <section aria-labelledby="privacy-cookies">
            <h2 id="privacy-cookies">Cookies</h2>
            <p>
              Neither tool sets a cookie before you accept. My own cookie is written when you make a choice,
              and not before.
            </p>
            <div className="bp-privacy__table">
              <table className="bp-table">
                <thead>
                  <tr>
                    <th scope="col">Cookie</th>
                    <th scope="col">Set by</th>
                    <th scope="col">What for</th>
                    <th scope="col">Lasts</th>
                  </tr>
                </thead>
                <tbody>
                  {COOKIES.map((cookie) => (
                    <tr key={cookie.name}>
                      <td>
                        <code>{cookie.name}</code>
                      </td>
                      <td data-label="Set by">{cookie.setBy}</td>
                      <td data-label="What for">{cookie.purpose}</td>
                      <td data-label="Lasts">{cookie.lasts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Clarity also sets a few cookies on Microsoft&rsquo;s own domains (<code>CLID</code>,{" "}
              <code>ANONCHK</code>, <code>MR</code>, <code>MUID</code> and <code>SM</code>). I can&rsquo;t read
              or delete those from this site; your browser&rsquo;s cookie settings can. Microsoft describes{" "}
              <code>MUID</code> as a cookie used across its sites for advertising, among other things. I tell
              Clarity that advertising storage is denied, and I don&rsquo;t use Clarity for advertising.
            </p>
          </section>

          <section aria-labelledby="privacy-signin-cookies">
            <h2 id="privacy-signin-cookies">Cookies for signing in</h2>
            <p>
              Signing in to the trading app sets the three cookies below, on the trading app only. They are
              essential for signing in, so they don&rsquo;t depend on your analytics choice, and they are set
              only when you sign in. Sign out and they are removed.
            </p>
            <div className="bp-privacy__table">
              <table className="bp-table">
                <thead>
                  <tr>
                    <th scope="col">Cookie</th>
                    <th scope="col">Set by</th>
                    <th scope="col">What for</th>
                    <th scope="col">Lasts</th>
                  </tr>
                </thead>
                <tbody>
                  {SIGN_IN_COOKIES.map((cookie) => (
                    <tr key={cookie.name}>
                      <td>
                        <code style={{ overflowWrap: "anywhere" }}>{cookie.name}</code>
                      </td>
                      <td data-label="Set by">{cookie.setBy}</td>
                      <td data-label="What for">{cookie.purpose}</td>
                      <td data-label="Lasts">{cookie.lasts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="privacy-ads">
            <h2 id="privacy-ads">Advertising is off</h2>
            <p>
              For Google, <code>ad_storage</code>, <code>ad_user_data</code> and <code>ad_personalization</code>{" "}
              are always denied, and Google signals and ad personalization are switched off. Only{" "}
              <code>analytics_storage</code> changes, and only when you accept. For Clarity, advertising
              storage is denied too.
            </p>
          </section>

          <section aria-labelledby="privacy-change">
            <h2 id="privacy-change">Changing your choice</h2>
            <p>
              Use <strong>Cookie settings</strong> in the footer of any page, here or in the trading app. It
              reopens the choice. If you withdraw, both tools stop, I delete the cookies of theirs that this
              site can reach, and the page reloads without them. Cookies on Microsoft&rsquo;s domains stay
              until your browser clears them.
            </p>
          </section>

          <section aria-labelledby="privacy-tools">
            <h2 id="privacy-tools">The tools&rsquo; own policies</h2>
            <p>
              Google and Microsoft handle the data they receive under their own terms:{" "}
              <a href="https://policies.google.com/privacy">Google&rsquo;s privacy policy</a> and{" "}
              <a href="https://privacy.microsoft.com/privacystatement">Microsoft&rsquo;s privacy statement</a>.
            </p>
          </section>

          <section aria-labelledby="privacy-handle">
            <h2 id="privacy-handle">Your handle</h2>
            <p>
              If you choose a handle in the trading app, Bullpen stores it, and it shows on the leaderboard only
              once it is approved. To check it, the text of the handle, and nothing else about you, is sent to a
              decision model (TypeSafe&rsquo;s Jev) through Vercel AI Gateway. A person looks at any handle the
              model is unsure of.
            </p>
            <p>
              TypeSafe handles what it receives under its own terms:{" "}
              <a href="https://typesafe.ai/privacy">TypeSafe&rsquo;s privacy policy</a>.
            </p>
          </section>

          <section aria-labelledby="privacy-contact">
            <h2 id="privacy-contact">Questions</h2>
            <p>
              If you have a question, or want something looked at, reach me through{" "}
              <a href="https://tiarebalbi.com">my site</a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
