import { RefObject, useEffect } from "react";
import styled from "@emotion/styled";
import SVG from "../assets/SVG";
import fonts from "../styles/fonts";
import { Link } from "react-router-dom";
import { motion, useAnimation, useInView } from "framer-motion";

type RefType = RefObject<Element>;

interface Props {
  aboutRef: RefType;
  skillsRef: RefType;
  contactRef: RefType;
}

const Navbar: React.FC<Props> = (props) => {
  const { aboutRef, contactRef, skillsRef } = props;

  const aboutIsInView = useInView(aboutRef, { amount: 0.5 });
  const skillsIsInView = useInView(skillsRef, { amount: 0.5 });
  const contactIsInView = useInView(contactRef, { amount: 0.5 });
  const aboutIsVisible = useAnimation();
  const skillsIsVisible = useAnimation();
  const contactIsVisible = useAnimation();

  const variants = {
    hidden: { opacity: 0.3 },
    visible: { opacity: 1 },
  };

  useEffect(() => {
    if (aboutIsInView) {
      aboutIsVisible.start("visible");
    } else {
      aboutIsVisible.start("hidden");
    }
    if (skillsIsInView) {
      skillsIsVisible.start("visible");
    } else {
      skillsIsVisible.start("hidden");
    }
    if (contactIsInView) {
      contactIsVisible.start("visible");
    } else {
      contactIsVisible.start("hidden");
    }
  }, [aboutIsInView, skillsIsInView, contactIsInView]);

  return (
    <Holder>
      <div className="logo">
        <SVG.Icons.logo />
      </div>
      <div className="center-links">
        <motion.div
          className="about highlight"
          variants={variants}
          initial="hidden"
          animate={aboutIsVisible}
        >
          <Link to="#about" className="link">
            About
          </Link>
        </motion.div>
        <motion.div
          className="skills highlight"
          variants={variants}
          initial="hidden"
          animate={skillsIsVisible}
        >
          <Link to="#skills" className="link">
            Skills
          </Link>
        </motion.div>
        <motion.div
          className="contact highlight"
          variants={variants}
          initial="hidden"
          animate={contactIsVisible}
        >
          <Link to="#contact" className="link">
            Contact
          </Link>
        </motion.div>
      </div>
      <div className="end-button">
        <button className="download-cv-button">DOWNLOAD CV</button>
        <SVG.Icons.buttonArrow />
      </div>
    </Holder>
  );
};

const Holder = styled.div`
  user-select: none;
  position: fixed;
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  align-items: center;
  padding-inline: 4em;
  height: 6em;
  width: calc(100% - 8em);
  z-index: 10;
  backdrop-filter: blur(20px);
  mask-image: linear-gradient(
    white 50%,
    rgba(0, 0, 0, 0.9) 65%,
    transparent 100%
  );

  .logo svg {
    width: 4rem;
  }

  .center-links {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }

  .skills {
    display: flex;
    justify-content: center;
  }
  .contact {
    display: flex;
    justify-content: end;
  }

  .link {
    ${fonts.NavText}
    font-size: 1.5rem;
    color: #ffffff;
    text-decoration: none;
  }

  .end-button {
    display: flex;
    justify-content: end;
    align-items: center;
  }

  .download-cv-button {
    ${fonts.SecondaryText}
    background: none;
    border: none;
    font-size: 1.5em;
    color: #ffffff;
  }

  .highlight {
    transition: opacity 0.3s;
    :hover {
      opacity: 1 !important;
    }
  }
`;

export default Navbar;
