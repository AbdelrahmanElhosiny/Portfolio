import styled from "@emotion/styled";
import "./App.css";
import Background from "./components/Background";
import Navbar from "./components/Navbar";
import CenterText from "./components/about-section/CenterText";
import MarqueeTrack from "./components/about-section/MarqueeTrack";
import { useRef } from "react";
import fonts from "./styles/fonts";
import Description from "./components/about-section/Description";
import Carousel from "./components/skills-section/Carousel";

function App() {
  const aboutRef = useRef(null);
  const skillsRef = useRef(null);
  const contactRef = useRef(null);

  return (
    <Holder>
      <Background />
      <Navbar
        aboutRef={aboutRef}
        skillsRef={skillsRef}
        contactRef={contactRef}
      />
      <div id="about" className="about-section" ref={aboutRef}>
        <CenterText />
        <Description />
        <MarqueeTrack />
      </div>
      <div id="skills" className="section" ref={skillsRef}>
        <div className="title">
          <h1>Skills</h1>
        </div>
        <div className="carousel-wrapper">
          <Carousel />
        </div>
      </div>
      <div id="contact" className="section" ref={contactRef}>
        <div className="title">
          <h1>Contact</h1>
        </div>
      </div>
    </Holder>
  );
}

const Holder = styled.div`
  position: relative;
  width: 100%;

  .about-section {
    height: 100vh;
    height: 100dvh;
  }
  .section {
    height: calc(100vh - 5rem);
    scroll-margin: 5rem;
  }

  .title {
    display: flex;
    justify-content: center;
    align-items: center;
    ${fonts.CenterText}
    color: #ffffff;
    font-size: 2em;
  }

  .carousel-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
  }
`;

export default App;
