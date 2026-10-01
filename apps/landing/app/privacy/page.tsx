import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Footer } from "../components/Footer.js";

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

export default function PrivacyPage(): ReactNode {
  return (
    <>
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
            Bullpen is a project I build in public. It has no accounts or sign-in yet, so I hold nothing
            about you by name. If you accept, two analytics tools measure how the site is used. If you
            don&rsquo;t, they never load.
          </p>
          <p className="bp-privacy__updated">Last updated 1 October 2026</p>
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
                      <td>{cookie.setBy}</td>
                      <td>{cookie.purpose}</td>
                      <td>{cookie.lasts}</td>
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
