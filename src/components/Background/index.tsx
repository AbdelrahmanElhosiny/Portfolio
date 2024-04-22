import styled from "@emotion/styled";
import SVG from "../../assets/SVG";

const Background = () => {
  return (
    <Holder>
      <div className="yellow-circle">
        <SVG.BackgroundShapes.yellowCircle />
      </div>
      <div className="pink-circle">
        <SVG.BackgroundShapes.pinkCircle />
      </div>
      <div className="star">
        <SVG.BackgroundShapes.star />
      </div>
    </Holder>
  );
};

const Holder = styled.div`
  .yellow-circle svg {
    position: absolute;
    right: 0em;
    z-index: -1;
  }

  .pink-circle svg {
    position: absolute;
    left: 0;
    z-index: -1;
    top: 20em;
  }

  .star svg {
    position: absolute;
    top: 100em;
    right: 10em;
    z-index: -1;
  }
`;

export default Background;
