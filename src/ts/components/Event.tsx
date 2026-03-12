// src/ts/components/Event.tsx
import { useState, useEffect } from 'react';
import './Event.css';
import { loadEventDefinition, EventDefinition, CountryEffects } from '../modules/nationalFocus';
import { useGameStore, CountryState } from '../modules/gameState';
import { SettingState } from '../modules/store';
import ToolTip from './ToolTip';

export default function Event({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventDefinition | null>(null);
  const lang = SettingState.language as 'ja' | 'en';

  const game = useGameStore((state) => state.game);
  const updateCountry = useGameStore((state) => state.updateCountry);
  const removePendingEvents = useGameStore((state) => state.removePendingEvents);

  useEffect(() => {
    loadEventDefinition(eventId)
      .then((data) => {
        setEvent(data as EventDefinition);
      })
      .catch((err) => {
        console.error("Failed to load event data:", err);
      });
  }, [eventId, lang]);

  const handleButtonClick = (effects?: CountryEffects) => {
    // プレイヤーの国のパラメータを更新
    if (effects && game?.playerCountryId) {
      const player = game.countries[game.playerCountryId];
      const updates: Partial<CountryState> = {};

      if (effects.legitimacy) updates.legitimacy = player.legitimacy + effects.legitimacy;
      if (effects.politicalPower) updates.politicalPower = player.politicalPower + effects.politicalPower;
      if (effects.economicStrength) updates.economicStrength = player.economicStrength + effects.economicStrength;
      if (effects.culturalUnity) updates.culturalUnity = player.culturalUnity + effects.culturalUnity;
      if (effects.deployedMilitary) updates.deployedMilitary = player.deployedMilitary + effects.deployedMilitary;
      if (effects.militaryEquipment) updates.militaryEquipment = player.militaryEquipment + effects.militaryEquipment;
      if (effects.mechanizationRate) updates.mechanizationRate = player.mechanizationRate + effects.mechanizationRate;

      updateCountry(game.playerCountryId, updates);
    }
    removePendingEvents([eventId]);
  };

  if (!event) return null;

  return (
    <div className="event-component-container fade-in">
      <div className="event-component-inner">
        <p className="event-component-title">{event.title[lang]}</p>
        {event.img_path && (
          <img src={`/assets/images/events/${event.img_path}`} alt={event.title[lang]} className="event-component-img" />
        )}
        <div className="event-component-content">{event.content[lang]}</div>
        <div className="event-component-buttons">
         {event.buttons.map((button) => {
            const hoverText = button.hover?.[lang];
            const buttonKey = button.text[lang];

            if (hoverText) {
              return (
                <ToolTip key={buttonKey} text={hoverText}>
                  <button className="event-component-button" onClick={() => handleButtonClick(button.effects ?? undefined)}>
                    {button.text[lang]}
                  </button>
                </ToolTip>
              );
            }

            return (
              <button className="event-component-button" key={buttonKey} onClick={() => handleButtonClick(button.effects ?? undefined)}>
                {button.text[lang]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}