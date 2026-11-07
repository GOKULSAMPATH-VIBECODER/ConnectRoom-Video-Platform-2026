import { useState } from "react";
import "./Plans.css";

const plans = [
  { name: "Free", price: "₹0", features: ["Basic video access", "Standard quality", "1 video download per day"] },
  { name: "Bronze", price: "Configure price", features: ["Expanded video access", "HD quality where available", "Higher download quota"] },
  { name: "Silver", price: "Configure price", features: ["Premium video access", "Higher quality where available", "Higher download quota"] },
  { name: "Gold", price: "Configure price", features: ["All eligible video content", "Highest available quality", "Highest configured download quota"] }
];

export default function Plans() {
  const [selected, setSelected] = useState("Free");

  return (
    <main className="plans-page">
      <h1>ConnectRoom Plans</h1>
      <p>Choose the plan that suits you.</p>
      <div className="plans-grid">
        {plans.map((plan) => (
          <article className={`plan-card ${selected === plan.name ? "selected" : ""}`} key={plan.name}>
            <h2>{plan.name}</h2>
            <h3>{plan.price}</h3>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <button onClick={() => setSelected(plan.name)}>
              {selected === plan.name ? "Selected" : `Select ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      <p className="plans-note">
        Plan selection is a preview only. Configure paid prices, subscriptions,
        and download quotas in the backend before enabling purchases.
      </p>
    </main>
  );
}
