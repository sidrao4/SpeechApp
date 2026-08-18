Why React : this teleprompter app is a UI-State problem, where everything needs to rerender when any piece changes. Also if i add speech-to-text later, React has many compatible libraries

Why Vite: great feedback-loop behavior for an application like a teleprompter

Why TypeScript: Once the app has many pieces of state passed between components, there can be some type mismatching that TS catches in compile time rather than runtime.

Why Railway: I knew this wasnt going to be a static frontend, so I chose a platform that treats it like a real running server so I can implement speech-processing logic or a database. It also helped get the site up and running very quicklky.
Tradeoff: It isn't really industry standard, but I chose it mostly for deploy velocity, not really for scale, where I'd use AWS/GCP

How did you choose your stack? I chose options that optimized fast iteration on a state heavy, time sensitive UI, and for a smaller-scale project.