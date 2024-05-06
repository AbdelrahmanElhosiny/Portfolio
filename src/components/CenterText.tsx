import styled from "@emotion/styled";
import fonts from "../styles/fonts";

const CenterText = () => {
  return (
    <Holder>
      <div className="center-text">
        <h1 className="line1">Frontend</h1>
        <h1 className="line2">Developer</h1>
      </div>
    </Holder>
  );
};

const Holder = styled.div`
  position: relative;
  top: 6em;

  .center-text {
    font-size: 5em;
    ${fonts.CenterText}
    display: grid;
  }

  h1 {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .line1 {
    background-image: radial-gradient(
      ellipse at 50% 35%,
      #5c5b5b 10%,
      #ffffff 50%
    );
    background-clip: text;
    color: transparent;
  }

  .line2 {
    background-image: linear-gradient(128deg, #e440a3 15%, #fba11d 90%);
    background-clip: text;
    color: transparent;
  }
`;

export default CenterText;
