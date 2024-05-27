import styled from "@emotion/styled";
import fonts from "../../styles/fonts";

const Description = () => {
  return (
    <Holder>
      <div className="mask">
        <div className="content">
          Lorem ipsum dolor, sit amet consectetur adipisicing elit. Consectetur
          accusamus doloribus odio quidem quos, necessitatibus mollitia rem fuga
          nam magni tenetur, repudiandae ea dicta omnis cumque nobis dignissimos
          quasi quae?
        </div>
      </div>
    </Holder>
  );
};

const Holder = styled.div`
  position: relative;

  .mask {
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 0.15em solid rgba(255, 255, 255, 0.1);
    border-radius: 2.5em;
    width: 20em;
    left: 7em;
    top: 12em;
    ${fonts.NavText}
    color: #ffffff;
    padding: 2em 2em 2em 4em;
    backdrop-filter: blur(4em);
    mask: linear-gradient(
      270deg,
      white 80%,
      rgba(0, 0, 0, 0.7) 88%,
      transparent 94%
    );
  }

  .content {
  }
`;

export default Description;
