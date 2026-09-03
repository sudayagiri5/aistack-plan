export default function Mark({ size = 20 }) {
  return (
    <div className="flex flex-col gap-0.75" style={{ width: size }}>
      <div className="h-0.75 w-full rounded-full bg-paper/20" />
      <div className="h-0.75 w-3/4 ml-1.5 rounded-full bg-marker" />
      <div className="h-0.75 w-[85%] rounded-full bg-paper/20" />
      <div className="h-0.75 w-1/2 rounded-full bg-paper/20" />
    </div>
  );
}