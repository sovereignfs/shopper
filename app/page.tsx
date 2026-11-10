import { site } from '@/src/site';

// A placeholder until the landing page (task 2.2) and the signed-in area exist.
export default function Home() {
  return (
    <main>
      <h1>{site.name}</h1>
      <p>{site.description}</p>
    </main>
  );
}
