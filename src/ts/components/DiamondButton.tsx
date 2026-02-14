import React from 'react';
import './DiamondButton.css';

type DiamondButtonProps = {
  text: string;
  size?: string;
  onClick: () => void;
  className?: string;
};

export const DiamondButton: React.FC<DiamondButtonProps> = ({
  text,
  size = '9rem',
  onClick,
  className = ''
}) => {
  return (
    <button
      className={`diamond-button-component-container ${className}`}
      style={{ width: size, height: size }}
      onClick={onClick}
    >
      <div className="diamond-button-bg"></div>
      <span className="diamond-button-component-text">{text}</span>
    </button>
  );
};