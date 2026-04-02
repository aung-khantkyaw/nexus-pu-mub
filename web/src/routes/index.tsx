import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"

function IndexComponent() {
  // TanStack Query Example
  const { isPending, error, data } = useQuery({
    queryKey: ["repoData"],
    queryFn: async () => {
      const res = await fetch("https://api.github.com/repos/TanStack/query")
      if (!res.ok) throw new Error("Network response was not ok")
      return res.json()
    },
  })

  // Handle loading and error states for the query
  if (isPending) return <div>Loading GitHub data...</div>
  if (error) return <div className="text-red-500">Error: {error.message}</div>

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Welcome Home!</h1>
      <p className="text-gray-600">
        This page shows that TanStack Router is rendering successfully.
      </p>

      <div className="rounded-md border bg-gray-50 p-4">
        <h3 className="text-lg font-semibold">TanStack Query Test:</h3>
        <p>
          The <strong>@tanstack/react-query</strong> repository currently has{" "}
          <span className="font-bold text-blue-600">
            {data.stargazers_count}
          </span>{" "}
          stars on GitHub.
        </p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/")({
  component: IndexComponent,
})

export default IndexComponent
