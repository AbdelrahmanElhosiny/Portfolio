import styled from "@emotion/styled";
import fonts from "../styles/fonts";
import SVG from "../assets/SVG";

const MarqueeTrack = () => {
  return (
    <Holder>
      <div className="track">
        <MarqueeGroup />
        <MarqueeGroup />
        <MarqueeGroup />
        <MarqueeGroup />
      </div>
    </Holder>
  );
};

const MarqueeGroup = () => {
  return (
    <>
      <div className="item">React</div>
      <div className="icon">
        <SVG.Icons.react />
      </div>
      <div className="item">CSS</div>
      <div className="icon">
        <SVG.Icons.css />
      </div>
      <div className="item">HTML</div>
      <div className="icon">
        <SVG.Icons.html />
      </div>
      <div className="item">Typescript</div>
      <div className="icon">
        <SVG.Icons.typescript />
      </div>
      <div className="item">MUI</div>
      <div className="icon">
        <SVG.Icons.mui />
      </div>
    </>
  );
};

const Holder = styled.div`
  user-select: none;
  position: relative;
  display: flex;
  align-items: center;
  top: 24em;
  left: -2em;
  width: 104vw;
  height: 6em;
  overflow-x: hidden;
  background-color: #ffffff30;
  border-block: 2px solid #ffffff30;
  transform: rotate(-3deg);
  ${fonts.RotatingText}
  color: #ffffff;
  opacity: 0.2;

  .track {
    display: flex;
    align-items: center;
    position: absolute;
    gap: 3rem;
    white-space: nowrap;
    will-change: transform;
    animation: scroll 25s linear infinite;
  }

  .item {
    font-size: 4em;
  }
  .icon svg {
    width: 3.5em;
  }

  @keyframes scroll {
    to {
      transform: translate(calc(-50% - 1.5rem));
      /* calc  (-50% - half the gap)*/
    }
  }
`;

export default MarqueeTrack;
