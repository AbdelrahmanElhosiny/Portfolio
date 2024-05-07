import styled from "@emotion/styled";
import SVG from "../assets/SVG";
import fonts from "../styles/fonts";

const Navbar = () => {
  return (
    <Holder>
      <div className="logo">
        <SVG.Icons.logo />
      </div>
      <ul className="center-links">
        <button className="link">About me</button>
        <button className="link">About me</button>
        <button className="link">About me</button>
      </ul>
      <div className="button">
        <button className="download-cv-button">DOWNLOAD CV</button>
        <SVG.Icons.buttonArrow />
      </div>
    </Holder>
  );
};

const Holder = styled.div`
  position: fixed;
  display: flex;
  align-items: center;
  padding-inline: 4em;
  height: 6em;
  justify-content: space-between;
  width: calc(100% - 8em);
  z-index: 10;
  backdrop-filter: blur(20px);
  mask-image: linear-gradient(
    white 50%,
    rgba(0, 0, 0, 0.9) 65%,
    transparent 100%
  );

  .logo svg {
    width: 4em;
  }
  .logo {
    @media (min-width: 1000px) {
      min-width: 12.65em;
    }
  }

  .center-links {
    display: flex;
    justify-content: space-between;
    width: 50%;
    max-width: 22em;
    padding: 0;
    font-size: 1.5em;
    ${fonts.NavText}
    color: #ffffff;
    justify-self: center;
  }

  .link {
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    background: none;
    border: none;
  }

  .download-cv-button {
    ${fonts.SecondaryText}
    background: none;
    border: none;
    font-size: 1.5em;
    color: #ffffff;
  }
`;

export default Navbar;
