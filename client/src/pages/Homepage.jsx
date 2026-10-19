import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  Dumbbell,
  ExternalLink,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";
import "./Homepage.css";

const GYM_ADDRESS = "34 A Mabini Tanauan Batangas, Mabini Ave, Tanauan City, Batangas";

const FEATURES = [
  {
    icon: Dumbbell,
    number: "01",
    title: "A plan built around you.",
    desc: "Training plans shaped around your goals, schedule, and starting point.",
  },
  {
    icon: TrendingUp,
    number: "02",
    title: "Progress you can see.",
    desc: "Keep your workouts and progress together, so every session adds up.",
  },
  {
    icon: Users,
    number: "03",
    title: "Coaching in your corner.",
    desc: "Connect with a coach who understands what you are working toward.",
  },
];

export default function Homepage() {
  return (
    <div className="home-page dark">
      <header className="home-header">
        <div className="home-header-inner">
          <Link to="/" className="home-brand" aria-label="AveFit home">
            <span className="home-brand-mark">A</span>
            <span className="home-brand-name">AVE<span>FIT</span><small>FITNESS CLUB</small></span>
          </Link>

          <nav className="home-nav" aria-label="Main navigation">
            <a href="#training">Training</a>
            <a href="#coaching">Coaching</a>
            <a href="#club">The club</a>
            <a href="#about">About Us</a>
          </nav>

        </div>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="home-title">
          <img
            className="home-hero-image"
            src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=2200&q=85"
            alt="Strength training equipment inside a modern gym"
            fetchPriority="high"
          />
          <div className="home-hero-shade" aria-hidden="true" />
          <div className="home-hero-content">
            <p className="home-eyebrow home-eyebrow-light">Avenue Power &amp; Fitness Gym</p>
            <h1 id="home-title">Stronger starts <span>right here.</span></h1>
            <p className="home-hero-copy">
              Bring your goals. We&apos;ll help you build the strength, habits, and confidence to reach them.
            </p>
            <div className="home-hero-actions">
              <Link to="/user/login" className="home-button home-button-orange">
                Start your journey <ArrowRight size={18} />
              </Link>
            </div>
            <div className="home-hero-note">
              <span className="home-note-rule" />
              <span>Train with purpose. Progress at your pace.</span>
            </div>
          </div>
        </section>

        <section className="home-training home-section" id="training">
          <div className="home-section-heading">
            <p className="home-eyebrow">Make every session count</p>
            <h2>Your goals deserve more than guesswork.</h2>
            <p className="home-section-intro">
              A good routine gives you somewhere to start. The right support helps you keep moving.
            </p>
          </div>

          <ul className="home-feature-list">
            {FEATURES.map(({ icon: Icon, number, title, desc }) => (
              <li className="home-feature" key={number}>
                <div className="home-feature-top">
                  <span className="home-feature-number">{number}</span>
                  <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3>{title}</h3>
                <p>{desc}</p>
                <a className="home-feature-link" href="#club">
                  Find your next step <ArrowUpRight size={15} />
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-club" id="club">
          <div className="home-club-inner">
            <div className="home-club-image-wrap">
              <img
                src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=85"
                alt="Athlete focused on a strength training session"
                loading="lazy"
              />
              <span className="home-image-caption">YOUR WORK. YOUR PACE.</span>
            </div>
            <div className="home-club-copy">
              <p className="home-eyebrow">More than a workout</p>
              <h2>Show up for yourself. We&apos;ll meet you there.</h2>
              <p>
                Start where you are, build a routine that fits your life, and keep track of how far you&apos;ve come.
                AveFit brings your training and coaching journey together in one place.
              </p>
            </div>
          </div>
        </section>

        <section className="home-about" id="about" aria-labelledby="home-about-title">
          <div className="home-about-inner">
            <div className="home-about-copy">
              <p className="home-eyebrow">Come visit us</p>
              <h2 id="home-about-title">A local gym for your next strong start.</h2>
              <p>
                Visit Avenue Power and Fitness Gym in Tanauan City. Find our location, check our opening hours, and plan your next workout.
              </p>
              <div className="home-about-detail">
                <MapPin size={19} aria-hidden="true" />
                <address>{GYM_ADDRESS}</address>
              </div>
              <div className="home-about-detail">
                <Clock3 size={19} aria-hidden="true" />
                <p>Monday–Saturday: 5:00 AM–10:00 PM<br />Sunday: 7:00 AM–6:00 PM</p>
              </div>
              <a
                className="home-button home-button-orange home-directions"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(GYM_ADDRESS)}`}
                target="_blank"
                rel="noreferrer"
              >
                Get directions <ExternalLink size={16} />
              </a>
            </div>
            <div className="home-map-frame">
              <iframe
                title="Map showing Avenue Power and Fitness Gym in Tanauan City, Batangas"
                src={`https://maps.google.com/maps?q=${encodeURIComponent(GYM_ADDRESS)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>

        <section className="home-coaching" id="coaching">
          <div className="home-coaching-inner">
            <div className="home-coaching-heading">
              <p className="home-eyebrow home-eyebrow-light">Built around real life</p>
              <h2>Good training is personal.</h2>
              <p>Keep your plan practical, your progress visible, and support close when you need it.</p>
            </div>
            <ol className="home-coaching-steps">
              <li><span>01</span><p>Set a goal that matters to you.</p></li>
              <li><span>02</span><p>Follow a plan made for your routine.</p></li>
              <li><span>03</span><p>Check in, adjust, and keep going.</p></li>
            </ol>
          </div>
        </section>

        <section className="home-join" aria-labelledby="home-join-title">
          <div className="home-join-inner">
            <div className="home-join-copy">
              <p className="home-eyebrow home-eyebrow-light">Your next session starts here</p>
              <h2 id="home-join-title">Ready to make <span>a start?</span></h2>
              <Link to="/user/login?mode=signup" className="home-signup-link">
                Sign Up <ArrowUpRight size={17} />
              </Link>
            </div>
            <ul className="home-join-pillars">
              <li>Strength</li>
              <li>Consistency</li>
              <li>Progress</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-inner">
          <div>
            <Link to="/" className="home-footer-brand">AVE<span>FIT</span></Link>
            <p>© 2026 AveFit · Avenue Power and Fitness Gym</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
